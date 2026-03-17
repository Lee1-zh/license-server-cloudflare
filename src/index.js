// Cloudflare Workers 授权服务端
// 替代原有的Vercel Flask服务

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS头 - 允许Python客户端跨域访问
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      // 路由分发
      if (path === '/api/check_license' && request.method === 'POST') {
        return await checkLicense(request, env, corsHeaders);
      } 
      else if (path === '/api/update_license' && request.method === 'POST') {
        return await updateLicense(request, env, corsHeaders);
      } 
      else if (path === '/api/list_licenses' && request.method === 'GET') {
        return await listLicenses(request, env, corsHeaders);
      } 
      else if (path === '/api/test' && request.method === 'GET') {
        return new Response(JSON.stringify({status: "ok", service: "T-Waves License Server"}), {
          headers: {...corsHeaders, 'Content-Type': 'application/json'}
        });
      }
      
      return new Response(JSON.stringify({error: "Not Found"}), { 
        status: 404, 
        headers: {...corsHeaders, 'Content-Type': 'application/json'}
      });
      
    } catch (error) {
      return new Response(JSON.stringify({error: error.message}), {
        status: 500,
        headers: {...corsHeaders, 'Content-Type': 'application/json'}
      });
    }
  }
};

// 检查授权（客户端启动时调用）
async function checkLicense(request, env, corsHeaders) {
  const body = await request.json();
  const machineCode = body.machine_code?.replace(/-/g, ''); // 移除分隔符
  
  if (!machineCode || machineCode.length !== 32) {
    return new Response(JSON.stringify({
      authorized: false,
      message: "无效的机器码格式"
    }), {
      headers: {...corsHeaders, 'Content-Type': 'application/json'}
    });
  }
  
  // 从KV读取授权状态
  const licenseData = await env.LICENSE_KV.get(machineCode);
  
  if (licenseData) {
    const data = JSON.parse(licenseData);
    return new Response(JSON.stringify({
      authorized: data.authorized === true,
      message: data.authorized ? "授权有效" : "授权已被撤销",
      timestamp: data.timestamp
    }), {
      headers: {...corsHeaders, 'Content-Type': 'application/json'}
    });
  }
  
  // 未找到授权记录
  return new Response(JSON.stringify({
    authorized: false,
    message: "设备未授权，请联系管理员"
  }), {
    headers: {...corsHeaders, 'Content-Type': 'application/json'}
  });
}

// 更新授权（管理端调用，添加/取消授权）
async function updateLicense(request, env, corsHeaders) {
  const body = await request.json();
  const { machine_code, authorized, timestamp } = body;
  
  if (!machine_code) {
    return new Response(JSON.stringify({error: "缺少机器码"}), {
      status: 400,
      headers: {...corsHeaders, 'Content-Type': 'application/json'}
    });
  }
  
  const cleanCode = machine_code.replace(/-/g, '');
  
  // 保存到KV存储
  await env.LICENSE_KV.put(cleanCode, JSON.stringify({
    authorized: authorized === true,
    timestamp: timestamp || new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));
  
  return new Response(JSON.stringify({
    success: true,
    message: authorized ? "授权成功" : "已取消授权",
    machine_code: cleanCode
  }), {
    headers: {...corsHeaders, 'Content-Type': 'application/json'}
  });
}

// 列出所有授权设备（管理端使用）
async function listLicenses(request, env, corsHeaders) {
  // 简单列出所有KV键值对（生产环境建议加分页）
  const list = await env.LICENSE_KV.list();
  const licenses = {};
  
  for (const key of list.keys) {
    try {
      const value = await env.LICENSE_KV.get(key.name);
      if (value) {
        licenses[key.name] = JSON.parse(value);
      }
    } catch (e) {
      console.error(`读取键 ${key.name} 失败:`, e);
    }
  }
  
  return new Response(JSON.stringify({
    licenses: licenses,
    count: Object.keys(licenses).length
  }), {
    headers: {...corsHeaders, 'Content-Type': 'application/json'}
  });
}