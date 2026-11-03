                // Doctor-only client disguise. The marker is honored only for a valid admin panel
                // session and is always removed before the upstream request.
                newHeaders.delete('X-Emby-Doctor-Test');
                newHeaders.delete('X-Emby-Doctor-Line');
                if (doctorProxyMode) {
                        const doctorToken = request.headers.get('X-Emby-Token') || request.headers.get('X-MediaBrowser-Token') || '';
                        newHeaders.set('User-Agent', DOCTOR_CLIENT_PROFILE.ua);
                        newHeaders.set('Accept', '*/*');
                        newHeaders.set('Accept-Language', 'en-US,en;q=0.9');
                        newHeaders.set('X-Emby-Authorization', doctorAuthHeaderValue(doctorToken));
                        if (doctorToken) newHeaders.set('X-Emby-Token', doctorToken);
                        newHeaders.set('Origin', targetUrl.origin);
                        newHeaders.set('Referer', targetUrl.origin + '/');
                }
