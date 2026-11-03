        if (url.pathname === '/api/doctor' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const prefix = String(body.prefix || '').trim();
                const username = String(body.username || '').trim();
                const password = String(body.password == null ? '' : body.password);
                if (!prefix || prefix.length > 80) return Response.json({ success: false, error: '请选择需要检测的节点' }, { status: 400 });
                if (username.length > 128 || /[\u0000-\u001f]/.test(username)) return Response.json({ success: false, error: '普通用户账号格式不正确' }, { status: 400 });
                if (password.length > 512 || password.includes('\u0000')) return Response.json({ success: false, error: '普通用户密码格式不正确' }, { status: 400 });
                if (!username && password) return Response.json({ success: false, error: '填写密码时必须同时填写普通用户账号' }, { status: 400 });
                await ensureRoutesSchema(env);
                const route = await env.DB.prepare("SELECT prefix, target, remark FROM routes WHERE prefix = ? AND IFNULL(owner, '') = ''").bind(prefix).first();
                if (!route) return Response.json({ success: false, error: '节点不存在或不是管理员节点' }, { status: 404 });
                const report = await runEmbyDoctor(route, { username, password });
                const gate = await getProxyToken(env);
                const pathPrefix = gate && gate.enabled && gate.key ? '/' + encodeURIComponent(gate.key) : '';
                report.proxyBase = pathPrefix + '/' + route.prefix.split('/').map(encodeURIComponent).join('/');
                report.node = { prefix: route.prefix, remark: route.remark || route.prefix };
                return new Response(JSON.stringify(Object.assign({ success: true }, report)), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
                });
            } catch (error) {
                return Response.json({ success: false, error: error && error.message ? error.message : '体检失败' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
            }
        }
