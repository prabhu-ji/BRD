const fs = require('fs-extra');
const path = require('path');

class APIDocsManager {
    constructor() {
        this.vendorDocs = new Map();
        this.scrapedDataDir = __dirname; // Files are in the current directory
        this.initialize();
    }

    async initialize() {
        await this.loadScrapedPostmanData();
    }

    // Get API context for integration
    async getAPIContext(integrationDetails) {
        const { vendor, modules = [], integrationMode = '' } = integrationDetails;
        const vendorKey = vendor.toLowerCase();
        
        console.log(`🔍 Getting API context for: ${vendor}`);
        
        if (!this.vendorDocs.has(vendorKey)) {
            console.log(`⚠️  No API documentation found for ${vendor}`);
            return this.getDefaultContext(vendor);
        }
        
        const docs = this.vendorDocs.get(vendorKey);
        
        // Filter relevant endpoints based on modules
        const relevantEndpoints = this.filterEndpointsByModules(docs.endpoints, modules);
        
        return {
            vendor: vendor,
            hasDocumentation: true,
            endpoints: relevantEndpoints,
            authentication: docs.authentication,
            dataModels: docs.dataModels,
            examples: docs.examples,
            guidelines: docs.guidelines,
            moduleInfo: this.getModuleInfo(modules, docs)
        };
    }

    filterEndpointsByModules(endpoints, modules) {
        if (!modules || modules.length === 0) {
            return endpoints;
        }
        
        return endpoints.filter(endpoint => {
            const pathLower = endpoint.path.toLowerCase();
            const descLower = (endpoint.description || '').toLowerCase();
            const endpointModule = (endpoint.module || '').toLowerCase();
            
            return modules.some(module => {
                const moduleLower = module.toLowerCase();
                return pathLower.includes(moduleLower) || 
                       descLower.includes(moduleLower) ||
                       endpointModule.includes(moduleLower) ||
                       pathLower.includes('employee') && moduleLower.includes('core') ||
                       pathLower.includes('payroll') && moduleLower.includes('payroll');
            });
        });
    }

    getModuleInfo(modules, docs) {
        const moduleInfo = {};
        
        modules.forEach(module => {
            const moduleLower = module.toLowerCase();
            
            // Get module-specific endpoints
            const moduleEndpoints = docs.endpoints.filter(ep => 
                ep.path.toLowerCase().includes(moduleLower) ||
                (ep.description || '').toLowerCase().includes(moduleLower) ||
                (ep.module || '').toLowerCase().includes(moduleLower)
            );
            
            moduleInfo[module] = {
                endpoints: moduleEndpoints,
                description: this.getModuleDescription(module)
            };
        });
        
        return moduleInfo;
    }

    getModuleDescription(module) {
        const descriptions = {
            'Core': 'Employee management, personal information, organizational structure',
            'Employee Management': 'Employee data management, profiles, organizational structure',
            'Payroll': 'Salary processing, tax calculations, payroll runs',
            'Performance': 'Performance reviews, goal setting, feedback management',
            'Recruitment': 'Job postings, candidate management, hiring workflow',
            'Time': 'Time tracking, attendance, leave management',
            'Attendance': 'Attendance tracking, timesheet management, punch data'
        };
        
        return descriptions[module] || `${module} module functionality`;
    }

    getDefaultContext(vendor) {
        return {
            vendor: vendor,
            hasDocumentation: false,
            endpoints: [],
            authentication: {},
            dataModels: {},
            examples: [],
            guidelines: [],
            moduleInfo: {},
            recommendations: [
                `No API documentation available for ${vendor}`,
                'Consider adding Postman collection data for this vendor',
                'Scrape or manually add API specifications for better BRD generation'
            ]
        };
    }

    // Format API context for AI consumption
    formatForAI(apiContext) {
        if (!apiContext.hasDocumentation) {
            return `⚠️ No API documentation available for ${apiContext.vendor}. Consider adding documentation for more accurate BRD generation.\n\nRecommendations:\n${apiContext.recommendations.join('\n')}\n\n`;
        }

        let formattedContext = `📚 API Documentation Context for ${apiContext.vendor}:\n\n`;

        // Authentication
        if (apiContext.authentication && Object.keys(apiContext.authentication).length > 0) {
            formattedContext += `🔐 Authentication:\n`;
            if (apiContext.authentication.type) {
                formattedContext += `Type: ${apiContext.authentication.type}\n`;
            }
            if (apiContext.authentication.description) {
                formattedContext += `Details: ${apiContext.authentication.description}\n`;
            }
            formattedContext += '\n';
        }

        // Endpoints
        if (apiContext.endpoints.length > 0) {
            formattedContext += `🔗 Available Endpoints (${apiContext.endpoints.length} total):\n`;
            apiContext.endpoints.slice(0, 10).forEach(endpoint => { // Limit to first 10
                formattedContext += `• ${endpoint.method} ${endpoint.path}`;
                if (endpoint.description) {
                    formattedContext += ` - ${endpoint.description}`;
                }
                formattedContext += '\n';
            });
            
            if (apiContext.endpoints.length > 10) {
                formattedContext += `... and ${apiContext.endpoints.length - 10} more endpoints\n`;
            }
            formattedContext += '\n';
        }

        // Module Information
        if (Object.keys(apiContext.moduleInfo).length > 0) {
            formattedContext += `📦 Module-Specific Information:\n`;
            Object.entries(apiContext.moduleInfo).forEach(([module, info]) => {
                formattedContext += `${module}: ${info.description}\n`;
                if (info.endpoints.length > 0) {
                    formattedContext += `  Endpoints: ${info.endpoints.length} available\n`;
                }
            });
            formattedContext += '\n';
        }

        // Guidelines
        if (apiContext.guidelines.length > 0) {
            formattedContext += `📋 Integration Guidelines:\n`;
            apiContext.guidelines.forEach(guide => {
                formattedContext += `• ${guide.title}: ${guide.content}\n`;
            });
            formattedContext += '\n';
        }

        return formattedContext;
    }

    // List available documentation (now only scraped data)
    getAvailableDocumentation() {
        const available = {};
        
        this.vendorDocs.forEach((docs, vendor) => {
            available[vendor] = {
                endpoints: docs.endpoints.length,
                hasAuth: Object.keys(docs.authentication).length > 0,
                hasModels: Object.keys(docs.dataModels).length > 0,
                examples: docs.examples.length,
                guidelines: docs.guidelines.length,
                source: 'postman_scraping'
            };
        });
        
        return available;
    }

    async loadScrapedPostmanData() {
        try {
            // Load detailed Postman APIs
            const detailedFilePath = path.join(this.scrapedDataDir, 'darwinbox-detailed-apis.json');
            
            if (fs.existsSync(detailedFilePath)) {
                const detailedData = fs.readJsonSync(detailedFilePath);
                
                if (detailedData.apis && detailedData.apis.length > 0) {
                    // Convert scraped data to our internal format
                    const convertedDocs = this.convertScrapedData(detailedData);
                    
                    // Add to vendor docs
                    const vendorKey = 'darwinbox';
                    this.vendorDocs.set(vendorKey, convertedDocs);
                    
                    console.log(`📊 Loaded ${detailedData.apis.length} detailed Postman APIs for darwinbox`);
                }
            }
            
            // Also load the simple scraped data if available
            const simpleFilePath = path.join(this.scrapedDataDir, 'darwinbox-apis.json');
            if (fs.existsSync(simpleFilePath)) {
                const simpleData = fs.readJsonSync(simpleFilePath);
                if (simpleData.apis && simpleData.apis.length > 0) {
                    console.log(`📋 Found ${simpleData.apis.length} additional APIs in simple format`);
                    
                    // Merge simple data if detailed doesn't exist
                    if (!this.vendorDocs.has('darwinbox')) {
                        const convertedSimpleData = this.convertScrapedData(simpleData);
                        this.vendorDocs.set('darwinbox', convertedSimpleData);
                    }
                }
            }
            
        } catch (error) {
            console.error('⚠️ Error loading scraped Postman data:', error.message);
        }
    }

    convertScrapedData(scrapedData) {
        const docs = {
            vendor: 'darwinbox',
            endpoints: [],
            authentication: {
                type: 'bearer',
                description: 'Bearer token authentication required'
            },
            dataModels: {},
            examples: [],
            guidelines: [],
            modules: {},
            scrapedData: scrapedData // Keep original for reference
        };

        // Convert each API to our endpoint format
        scrapedData.apis.forEach(api => {
            const endpoint = {
                method: api.method,
                path: api.path,
                url: api.url,
                description: api.description,
                module: api.module,
                parameters: api.parameters || [],
                body: api.body,
                headers: api.headers,
                auth: api.auth,
                tags: api.tags || [],
                source: 'postman_scraping'
            };

            docs.endpoints.push(endpoint);

            // Add to examples if body example exists
            if (api.body && api.body.example) {
                docs.examples.push({
                    title: `${api.method} ${api.name}`,
                    content: JSON.stringify(api.body.example, null, 2),
                    source: 'postman_scraping',
                    endpoint: endpoint
                });
            }

            // Group by modules
            if (api.module) {
                if (!docs.modules[api.module]) {
                    docs.modules[api.module] = {
                        endpoints: [],
                        description: this.getModuleDescription(api.module)
                    };
                }
                docs.modules[api.module].endpoints.push(endpoint);
            }
        });

        return docs;
    }

    // Enhanced search that includes scraped data
    searchAPIs(query, vendor = null) {
        const results = [];
        const searchLower = query.toLowerCase();
        
        this.vendorDocs.forEach((docs, vendorKey) => {
            if (vendor && vendorKey !== vendor.toLowerCase()) return;
            
            docs.endpoints.forEach(endpoint => {
                const searchableText = [
                    endpoint.method,
                    endpoint.path,
                    endpoint.description,
                    endpoint.module,
                    ...(endpoint.tags || []),
                    ...(endpoint.parameters || []).map(p => p.name + ' ' + (p.description || ''))
                ].join(' ').toLowerCase();
                
                if (searchableText.includes(searchLower)) {
                    results.push({
                        vendor: vendorKey,
                        endpoint: endpoint,
                        score: this.calculateRelevanceScore(searchableText, searchLower)
                    });
                }
            });
        });
        
        return results.sort((a, b) => b.score - a.score);
    }

    calculateRelevanceScore(text, query) {
        const words = query.split(' ');
        let score = 0;
        
        words.forEach(word => {
            const count = (text.match(new RegExp(word, 'g')) || []).length;
            score += count;
        });
        
        return score;
    }

    // Add new scraped data for any vendor
    addScrapedData(vendor, scrapedData) {
        const vendorKey = vendor.toLowerCase();
        const convertedDocs = this.convertScrapedData(scrapedData);
        convertedDocs.vendor = vendor;
        
        this.vendorDocs.set(vendorKey, convertedDocs);
        console.log(`📊 Added ${scrapedData.apis.length} APIs for ${vendor}`);
        
        return true;
    }

    // Get all available vendors
    getAvailableVendors() {
        return Array.from(this.vendorDocs.keys());
    }

    // Get summary statistics
    getStatistics() {
        let totalEndpoints = 0;
        let totalExamples = 0;
        const vendorStats = {};

        this.vendorDocs.forEach((docs, vendor) => {
            totalEndpoints += docs.endpoints.length;
            totalExamples += docs.examples.length;
            
            vendorStats[vendor] = {
                endpoints: docs.endpoints.length,
                examples: docs.examples.length,
                modules: Object.keys(docs.modules).length
            };
        });

        return {
            totalVendors: this.vendorDocs.size,
            totalEndpoints,
            totalExamples,
            vendorStats
        };
    }
}

module.exports = APIDocsManager; 