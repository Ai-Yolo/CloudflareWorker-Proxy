// 上游网站的域名.
const upstream = 'api.openai.com';

// 上游网站的自定义路径.
const upstream_path = '/';

// 被禁止访问服务的国家和地区列表.
const blocked_region = [];

// 被禁止访问服务的IP地址列表.
const blocked_ip_address = ['0.0.0.0', '127.0.0.1'];

// 是否禁用缓存.
const disable_cache = false;

// 用于替换响应文本中的内容的字典,将"$upstream"替换为"$custom_domain".
const replace_dict = {
    '$upstream': '$custom_domain',
};

// 添加HTTP请求事件监听器.
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

// 处理HTTP请求并生成响应.
async function handleRequest(request) {
    // 获取请求的区域、IP地址和用户代理信息.
    const region = request.headers.get('cf-ipcountry').toUpperCase();
    const ip_address = request.headers.get('cf-connecting-ip');
    const user_agent = request.headers.get('user-agent');

    const url = new URL(request.url);
    const urlHostname = url.hostname;

    // 设置URL的协议为"https".
    url.protocol = 'https:';

    // 根据用户代理判断用户设备类型（移动设备或桌面设备）.
    const isMobile = isMobileDevice(user_agent);

    // 选择上游域名.
    const upstreamDomain = upstream;

    // 构建新的请求URL,指向上游网站,并处理自定义路径.
    url.host = upstreamDomain;
    if (url.pathname === '/') {
        url.pathname = upstream_path;
    } else {
        url.pathname = upstream_path + url.pathname;
    }

    // 检查请求的区域和IP地址是否在禁止访问列表中.
    if (blocked_region.includes(region)) {
        return new Response('Access denied: WorkersProxy is not available in your region yet.', {
            status: 403
        });
    } else if (blocked_ip_address.includes(ip_address)) {
        return new Response('Access denied: Your IP address is blocked by WorkersProxy.', {
            status: 403
        });
    }

    // 发送新的请求到上游网站,并获取响应.
    const method = request.method;
    const requestHeaders = request.headers;
    const newRequestHeaders = new Headers(requestHeaders);
    newRequestHeaders.set('Host', upstreamDomain);
    newRequestHeaders.set('Referer', url.protocol + '//' + urlHostname);
    const originalResponse = await fetch(url.href, {
        method: method,
        headers: newRequestHeaders,
        body: request.body
    });

    // 处理Websocket升级请求.
    if (newRequestHeaders.get("Upgrade")?.toLowerCase() === "websocket") {
        return originalResponse;
    }

    // 对响应进行处理,如删除或设置一些响应头、替换响应文本中的内容.
    const originalResponseClone = originalResponse.clone();
    const responseHeaders = originalResponse.headers;
    const newResponseHeaders = new Headers(responseHeaders);
    const status = originalResponse.status;

    // 设置响应头.
    newResponseHeaders.set('access-control-allow-origin', '*');
    newResponseHeaders.set('access-control-allow-credentials', 'true');
    newResponseHeaders.delete('content-security-policy');
    newResponseHeaders.delete('content-security-policy-report-only');
    newResponseHeaders.delete('clear-site-data');
    if (disable_cache) {
        newResponseHeaders.set('Cache-Control', 'no-store');
    }
    const pjaxUrl = newResponseHeaders.get("x-pjax-url");
    if (pjaxUrl) {
        newResponseHeaders.set("x-pjax-url", pjaxUrl.replace("//" + upstreamDomain, "//" + urlHostname));
    }

    const contentType = newResponseHeaders.get('content-type');
    let responseBody;
    // 如果响应内容类型是"text/html"且编码是"UTF-8",则对响应文本进行替换操作.
    if (contentType && contentType.includes('text/html') && contentType.includes('UTF-8')) {
        responseBody = await replaceResponseText(originalResponseClone, upstreamDomain, urlHostname);
    } else {
        responseBody = originalResponseClone.body;
    }

    // 返回处理后的响应给用户.
    return new Response(responseBody, {
        status,
        headers: newResponseHeaders
    });
}

// 替换响应文本中的内容,根据replace_dict中的键值对进行替换.
async function replaceResponseText(response, upstreamDomain, hostName) {
    let text = await response.text();
    const replacements = Object.entries(replace_dict).map(([key, value]) => {
        return {
            searchValue: key.replace('$upstream', upstreamDomain).replace('$custom_domain', hostName),
            replaceValue: value.replace('$upstream', upstreamDomain).replace('$custom_domain', hostName)
        };
    });
    replacements.forEach(({ searchValue, replaceValue }) => {
        text = text.replace(new RegExp(searchValue, 'g'), replaceValue);
    });
    return text;
}

// 判断用户设备类型,返回true表示桌面设备,false表示移动设备.
function isMobileDevice(userAgent) {
    const mobileAgents = ["Android", "iPhone", "SymbianOS", "Windows Phone", "iPad", "iPod"];
    return mobileAgents.some(agent => userAgent.includes(agent));
}
