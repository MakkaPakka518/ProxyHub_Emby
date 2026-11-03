        // Pin Doctor requests to the source line that passed the direct probe. This prevents
        // credentials from failing over to a different configured origin.
        let doctorProxyMode = false;
        if (request.headers.get('X-Emby-Doctor-Test') === '1') {
            let doctorAdmin = false;
            try { doctorAdmin = (await getAuthRole(request)) === 'admin'; } catch (e) {}
            const doctorLine = parseInt(request.headers.get('X-Emby-Doctor-Line') || '0', 10);
            if (doctorAdmin && doctorLine >= 1 && doctorLine <= targetUrls.length) {
                targetUrls = [targetUrls[doctorLine - 1]];
                targetOrigins = getTargetOrigins(targetUrls);
                doctorProxyMode = true;
            }
        }
