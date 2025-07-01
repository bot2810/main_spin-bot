
// Advanced Ad management with strong detection
class AdManager {
    constructor() {
        this.adBlockDetected = false;
        this.dnsBlockDetected = false;
        this.vpnDetected = false;
        this.proxyDetected = false;
        this.blockedUser = false;
        this.init();
    }

    init() {
        this.multiLayerDetection();
        this.setupAdClickHandlers();
        this.preventAutoClick();
        this.continuousMonitoring();
    }

    async multiLayerDetection() {
        // Delay detection to avoid false positives
        setTimeout(async () => {
            let detectionScore = 0;
            
            // Test 1: Traditional AdBlock Detection (weight: 3)
            if (await this.detectAdBlock()) detectionScore += 3;
            
            // Test 2: Network-based Detection (weight: 2)
            if (await this.detectNetworkBlocking()) detectionScore += 2;
            
            // Test 3: Element visibility check (weight: 2)
            if (await this.detectElementBlocking()) detectionScore += 2;
            
            // Only block if score is high enough (5+ points)
            if (detectionScore >= 5) {
                this.blockUser();
            } else {
                console.log(`Detection score: ${detectionScore}/7 - User allowed`);
            }
        }, 3000); // Wait 3 seconds for page to fully load
    }

    async detectAdBlock() {
        return new Promise((resolve) => {
            // Single reliable test element
            const testAd = document.createElement('div');
            testAd.innerHTML = 'Advertisement';
            testAd.className = 'ads adsbox ad-banner';
            testAd.style.cssText = 'position:absolute;left:-9999px;width:300px;height:250px;background:#fff;';
            document.body.appendChild(testAd);

            setTimeout(() => {
                const isBlocked = testAd.offsetHeight === 0 || testAd.offsetWidth === 0 || 
                                testAd.style.display === 'none' || testAd.style.visibility === 'hidden';
                
                try {
                    document.body.removeChild(testAd);
                } catch(e) {}
                
                if (isBlocked) {
                    console.log('AdBlock detected via element blocking');
                    resolve(true);
                } else {
                    resolve(false);
                }
            }, 1000);
        });
    }

    async detectNetworkBlocking() {
        return new Promise((resolve) => {
            // Test loading of known ad networks
            const adNetworks = [
                'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
                'https://www.googletagservices.com/tag/js/gpt.js',
                'https://static.doubleclick.net/instream/ad_status.js'
            ];

            let failedRequests = 0;
            let completedTests = 0;

            adNetworks.forEach(url => {
                const script = document.createElement('script');
                script.src = url;
                script.async = true;
                
                script.onerror = () => {
                    failedRequests++;
                    completedTests++;
                    if (completedTests === adNetworks.length) {
                        if (failedRequests >= 2) {
                            this.adBlockDetected = true;
                            console.log('AdBlock detected via network blocking');
                        }
                        resolve();
                    }
                };
                
                script.onload = () => {
                    completedTests++;
                    if (completedTests === adNetworks.length) {
                        resolve();
                    }
                };
                
                document.head.appendChild(script);
                
                // Cleanup
                setTimeout(() => {
                    try {
                        document.head.removeChild(script);
                    } catch(e) {}
                }, 2000);
            });

            // Fallback timeout
            setTimeout(() => {
                if (completedTests < adNetworks.length) {
                    this.adBlockDetected = true;
                    resolve();
                }
            }, 3000);
        });
    }

    async detectDNSFiltering() {
        return new Promise((resolve) => {
            // Test DNS resolution of ad domains
            const adDomains = [
                'googleads.g.doubleclick.net',
                'googlesyndication.com',
                'facebook.com/tr'
            ];

            let dnsBlocked = 0;
            let dnsTests = 0;

            adDomains.forEach(domain => {
                const img = new Image();
                img.onload = () => {
                    dnsTests++;
                    if (dnsTests === adDomains.length) {
                        resolve();
                    }
                };
                img.onerror = () => {
                    dnsBlocked++;
                    dnsTests++;
                    if (dnsTests === adDomains.length) {
                        if (dnsBlocked >= 2) {
                            this.dnsBlockDetected = true;
                            console.log('DNS blocking detected');
                        }
                        resolve();
                    }
                };
                img.src = `https://${domain}/favicon.ico?${Date.now()}`;
            });

            setTimeout(() => {
                if (dnsTests < adDomains.length) {
                    this.dnsBlockDetected = true;
                    resolve();
                }
            }, 4000);
        });
    }

    async detectVPNProxy() {
        return new Promise(async (resolve) => {
            try {
                // Test 1: WebRTC IP detection
                const ips = await this.getWebRTCIPs();
                if (ips.length > 1) {
                    this.vpnDetected = true;
                    console.log('VPN detected via WebRTC');
                }

                // Test 2: Timezone vs IP location mismatch
                const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                
                // Test 3: Common VPN headers
                const headers = this.checkVPNHeaders();
                if (headers) {
                    this.proxyDetected = true;
                    console.log('Proxy headers detected');
                }

                // Test 4: Connection speed anomalies
                const speed = await this.testConnectionSpeed();
                if (speed < 1000) { // Very slow, might indicate VPN
                    this.vpnDetected = true;
                    console.log('Suspicious connection speed');
                }

            } catch (error) {
                console.log('VPN detection error:', error);
            }
            resolve();
        });
    }

    async getWebRTCIPs() {
        return new Promise((resolve) => {
            const ips = [];
            const RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
            
            if (!RTCPeerConnection) {
                resolve(ips);
                return;
            }

            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            pc.createDataChannel('');
            pc.createOffer().then(offer => pc.setLocalDescription(offer));

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    const candidate = event.candidate.candidate;
                    const ip = candidate.split(' ')[4];
                    if (ip && !ips.includes(ip) && ip !== '0.0.0.0') {
                        ips.push(ip);
                    }
                }
            };

            setTimeout(() => {
                pc.close();
                resolve(ips);
            }, 2000);
        });
    }

    checkVPNHeaders() {
        // Check for common proxy/VPN indicators
        const suspiciousUAs = [
            'proxy', 'vpn', 'tor', 'anonymous', 'hide', 'mask'
        ];
        
        const userAgent = navigator.userAgent.toLowerCase();
        return suspiciousUAs.some(keyword => userAgent.includes(keyword));
    }

    async testConnectionSpeed() {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const img = new Image();
            
            img.onload = () => {
                const endTime = Date.now();
                const speed = 1000 / (endTime - startTime); // Simple speed calculation
                resolve(speed);
            };
            
            img.onerror = () => resolve(0);
            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7?' + Date.now();
        });
    }

    async detectElementBlocking() {
        return new Promise((resolve) => {
            // Create multiple ad-like elements with different techniques
            const techniques = [
                { style: 'width:300px;height:250px;background:url(data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7);', class: 'adsbox' },
                { style: 'width:728px;height:90px;', class: 'ad-leaderboard' },
                { style: 'width:160px;height:600px;', class: 'ad-skyscraper' }
            ];

            let blocked = 0;
            techniques.forEach((tech, index) => {
                const element = document.createElement('div');
                element.className = tech.class;
                element.style.cssText = tech.style + 'position:absolute;left:-9999px;';
                element.innerHTML = '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" width="100%" height="100%">';
                
                document.body.appendChild(element);

                setTimeout(() => {
                    if (element.offsetHeight === 0 || element.offsetWidth === 0) {
                        blocked++;
                    }
                    try {
                        document.body.removeChild(element);
                    } catch(e) {}
                    
                    if (index === techniques.length - 1) {
                        if (blocked >= 2) {
                            this.adBlockDetected = true;
                            console.log('AdBlock detected via element injection');
                        }
                        resolve();
                    }
                }, 500);
            });
        });
    }

    async detectScriptBlocking() {
        return new Promise((resolve) => {
            // Test if ad-related scripts are being blocked
            const testScript = document.createElement('script');
            testScript.innerHTML = `
                window.adTestResult = true;
                if (typeof adsbygoogle === 'undefined') {
                    window.adTestBlocked = true;
                }
            `;
            
            document.head.appendChild(testScript);
            
            setTimeout(() => {
                if (window.adTestBlocked || !window.adTestResult) {
                    this.adBlockDetected = true;
                    console.log('AdBlock detected via script blocking');
                }
                try {
                    document.head.removeChild(testScript);
                } catch(e) {}
                resolve();
            }, 1000);
        });
    }

    blockUser() {
        this.blockedUser = true;
        this.showBlockingWarning();
        
        // Disable all game functionality
        document.body.style.pointerEvents = 'none';
        
        // Hide all content
        const gameScreen = document.getElementById('gameScreen');
        const loginScreen = document.getElementById('loginScreen');
        if (gameScreen) gameScreen.style.display = 'none';
        if (loginScreen) loginScreen.style.display = 'none';
        
        // Block spin function
        window.startAdAndSpin = () => {
            alert('Please disable your ad blocker, VPN, or DNS filter to continue!');
        };
    }

    showBlockingWarning() {
        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            font-family: Arial, sans-serif;
            text-align: center;
        `;
        
        const reasons = [];
        if (this.adBlockDetected) reasons.push('🚫 Ad Blocker');
        if (this.dnsBlockDetected) reasons.push('🌐 DNS Filter');
        if (this.vpnDetected) reasons.push('🔒 VPN');
        if (this.proxyDetected) reasons.push('🌍 Proxy');
        
        warning.innerHTML = `
            <div style="padding: 40px; background: rgba(0,0,0,0.8); border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); max-width: 500px;">
                <h1 style="margin: 0 0 20px 0; font-size: 2.5em;">⚠️ ACCESS BLOCKED</h1>
                <h2 style="margin: 0 0 20px 0; color: #ffeb3b;">Detected: ${reasons.join(', ')}</h2>
                <p style="margin: 20px 0; font-size: 1.2em; line-height: 1.5;">
                    To continue playing and earning money:<br><br>
                    ✅ Disable your Ad Blocker<br>
                    ✅ Turn off VPN/Proxy<br>
                    ✅ Disable DNS filtering<br>
                    ✅ Use regular internet connection
                </p>
                <button onclick="location.reload()" style="
                    background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
                    color: white;
                    border: none;
                    padding: 15px 30px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 1.1em;
                    font-weight: bold;
                    margin-top: 20px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                ">🔄 Try Again</button>
                <p style="margin-top: 20px; font-size: 0.9em; opacity: 0.8;">
                    We need ads to provide this free earning service
                </p>
            </div>
        `;
        document.body.appendChild(warning);
    }

    continuousMonitoring() {
        // Monitor every 30 seconds instead of 3 seconds
        setInterval(() => {
            if (!this.blockedUser) {
                // Only check if ads are still visible, don't auto-block
                this.checkAdElements();
            }
        }, 30000);
    }

    quickAdCheck() {
        const adElements = document.querySelectorAll('.ad-banner, .ad-sidebar, #topAd, #bottomAd, #leftAd, #rightAd');
        let visibleAds = 0;

        adElements.forEach(ad => {
            if (ad && ad.offsetHeight > 0 && ad.offsetWidth > 0 && 
                ad.style.display !== 'none' && ad.style.visibility !== 'hidden') {
                visibleAds++;
            }
        });

        if (visibleAds < 4) {
            console.warn('Some ads are not visible - possible ad blocking');
            this.adBlockDetected = true;
            this.blockUser();
        }
    }

    checkAdElements() {
        // Check if essential ad elements exist (more lenient)
        const requiredAds = ['topAd', 'bottomAd', 'leftAd', 'rightAd'];
        let missingAds = 0;

        requiredAds.forEach(adId => {
            const element = document.getElementById(adId);
            if (!element || element.offsetHeight === 0) {
                missingAds++;
            }
        });

        // Only block if ALL ads are missing (not just more than 1)
        if (missingAds >= 4) {
            console.warn('All ads are missing - likely ad blocker');
            this.adBlockDetected = true;
            this.blockUser();
        } else {
            console.log(`${requiredAds.length - missingAds}/4 ads visible`);
        }
    }

    setupAdClickHandlers() {
        if (this.blockedUser) return;

        ['topAd', 'bottomAd', 'leftAd', 'rightAd'].forEach(adId => {
            const element = document.getElementById(adId);
            if (element) {
                element.addEventListener('click', () => {
                    this.simulateAdClick(adId.replace('Ad', ''));
                });
            }
        });
    }

    simulateAdClick(position) {
        if (this.blockedUser) return;
        
        console.log(`Ad clicked: ${position}`);
        const ad = document.getElementById(`${position}Ad`);
        if (ad) {
            const originalTransform = ad.style.transform;
            ad.style.transform = 'scale(0.95)';
            setTimeout(() => {
                ad.style.transform = originalTransform;
            }, 150);
        }
        this.trackAdClick(position);
    }

    trackAdClick(position) {
        fetch('/track-ad-click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                position: position,
                timestamp: new Date().toISOString()
            })
        }).catch(error => {
            console.log('Ad tracking failed:', error);
        });
    }

    preventAutoClick() {
        let rapidClicks = 0;
        let lastClickTime = 0;

        document.addEventListener('click', (event) => {
            const currentTime = Date.now();
            const timeDiff = currentTime - lastClickTime;

            if (timeDiff < 100) {
                rapidClicks++;
                if (rapidClicks > 5) {
                    this.showBotWarning();
                    return;
                }
            } else {
                rapidClicks = 0;
            }

            lastClickTime = currentTime;
        });

        // Enhanced automation detection
        this.detectAdvancedAutomation();
    }

    detectAdvancedAutomation() {
        // Check for automation tools
        if (navigator.webdriver || window.callPhantom || window._phantom || window.Headless) {
            this.showBotWarning();
            return;
        }

        // Check for suspicious window properties
        if (window.outerHeight - window.innerHeight > 200) {
            console.warn('Suspicious window dimensions - possible automation');
        }

        // Monitor mouse movement patterns
        let mouseEvents = 0;
        let straightLines = 0;
        let lastX = 0, lastY = 0;

        document.addEventListener('mousemove', (e) => {
            mouseEvents++;
            
            // Check for straight line movements (bot-like)
            if (lastX !== 0 && lastY !== 0) {
                if (Math.abs(e.clientX - lastX) === 0 || Math.abs(e.clientY - lastY) === 0) {
                    straightLines++;
                    if (straightLines > 10) {
                        console.warn('Bot-like mouse movement detected');
                    }
                }
            }
            
            lastX = e.clientX;
            lastY = e.clientY;
        });

        // Check natural interaction after delay
        setTimeout(() => {
            if (mouseEvents < 5) {
                console.warn('Very low mouse activity - possible bot');
            }
        }, 15000);
    }

    showBotWarning() {
        this.blockUser();
        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
 
