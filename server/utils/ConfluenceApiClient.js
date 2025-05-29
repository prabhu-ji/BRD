const axios = require("axios");
const Logger = require('./Logger');

/**
 * Handles all Confluence API operations and connection management
 * Extracted from ConfluenceGenerator to follow Single Responsibility Principle
 */
class ConfluenceApiClient {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl;
        this.username = config.username;
        this.apiToken = config.apiToken;
        
        if (this.baseUrl) {
            this.baseUrl = this.baseUrl.replace(/\/$/, "");
        }
        
        this.client = null;
        this.initializeClient();
    }

    /**
     * Initialize the Axios client with configuration and interceptors
     */
    initializeClient() {
        if (!this.baseUrl || !this.username || !this.apiToken) {
            Logger.warn("Confluence configuration incomplete. API client not initialized.");
            return;
        }

        this.client = axios.create({
            baseURL: `${this.baseUrl}/wiki/rest/api`,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            auth: {
                username: this.username,
                password: this.apiToken,
            },
            timeout: 30000,
        });

        this.setupInterceptors();
        Logger.success("Confluence API client initialized successfully");
    }

    /**
     * Setup request and response interceptors
     */
    setupInterceptors() {
        // Request interceptor
        this.client.interceptors.request.use(
            (config) => {
                Logger.apiRequest(config.method.toUpperCase(), config.url);
                return config;
            },
            (error) => {
                Logger.error("Request interceptor error:", error);
                return Promise.reject(error);
            }
        );

        // Response interceptor
        this.client.interceptors.response.use(
            (response) => {
                Logger.apiResponse(response.status, response.statusText);
                return response;
            },
            (error) => {
                Logger.apiError(error);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Test connection to Confluence
     * @param {string} spaceKey - Space key to test access
     * @returns {Object} Connection test result
     */
    async testConnection(spaceKey) {
        try {
            Logger.connectionTest("Testing Confluence connection...");

            if (!this.client) {
                throw new Error("API client not initialized. Check configuration.");
            }

            const userResponse = await this.client.get("/user/current");
            Logger.success(`Authenticated as: ${userResponse.data.displayName}`);

            if (spaceKey) {
                const spaceResponse = await this.client.get(`/space/${spaceKey}`);
                Logger.success(`Successfully accessed space: ${spaceResponse.data.name}`);
                
                return {
                    success: true,
                    message: `Successfully connected to Confluence space '${spaceKey}'`,
                    spaceName: spaceResponse.data.name,
                    spaceKey: spaceKey,
                    user: userResponse.data.displayName
                };
            } else {
                return {
                    success: true,
                    message: "Successfully connected to Confluence",
                    user: userResponse.data.displayName
                };
            }
        } catch (error) {
            Logger.error("Connection test failed:", error.response?.data || error.message);

            return {
                success: false,
                error: error.response?.data?.message || error.message,
                statusCode: error.response?.status,
                suggestion: this.getErrorSuggestion(error)
            };
        }
    }

    /**
     * Create a new Confluence page
     * @param {Object} pageData - Page creation data
     * @returns {Object} API response
     */
    async createPage(pageData) {
        try {
            this.validateClient();
            const response = await this.client.post("/content", pageData);
            Logger.success(`Page created: ${response.data.title} (ID: ${response.data.id})`);
            return response;
        } catch (error) {
            Logger.error(`Failed to create page: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update an existing Confluence page
     * @param {string} pageId - Page ID
     * @param {Object} updateData - Page update data
     * @returns {Object} API response
     */
    async updatePage(pageId, updateData) {
        try {
            this.validateClient();
            const response = await this.client.put(`/content/${pageId}`, updateData);
            Logger.success(`Page updated: ${response.data.title} (ID: ${pageId})`);
            return response;
        } catch (error) {
            Logger.error(`Failed to update page ${pageId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get page information
     * @param {string} pageId - Page ID
     * @param {Object} options - Query options
     * @returns {Object} API response
     */
    async getPage(pageId, options = {}) {
        try {
            this.validateClient();
            const response = await this.client.get(`/content/${pageId}`, { params: options });
            return response;
        } catch (error) {
            Logger.error(`Failed to get page ${pageId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get current user information
     * @returns {Object} API response
     */
    async getCurrentUser() {
        try {
            this.validateClient();
            return await this.client.get("/user/current");
        } catch (error) {
            Logger.error(`Failed to get current user: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get space information
     * @param {string} spaceKey - Space key
     * @returns {Object} API response
     */
    async getSpace(spaceKey) {
        try {
            this.validateClient();
            return await this.client.get(`/space/${spaceKey}`);
        } catch (error) {
            Logger.error(`Failed to get space ${spaceKey}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get the underlying Axios client for custom requests
     * @returns {Object} Axios client instance
     */
    getClient() {
        this.validateClient();
        return this.client;
    }

    /**
     * Get authentication configuration for external usage
     * @returns {Object} Auth configuration
     */
    getAuth() {
        return {
            username: this.username,
            password: this.apiToken
        };
    }

    /**
     * Get base URL for external usage
     * @returns {string} Base URL
     */
    getBaseUrl() {
        return this.baseUrl;
    }

    /**
     * Validate that the client is initialized
     * @throws {Error} If client is not initialized
     */
    validateClient() {
        if (!this.client) {
            throw new Error("Confluence API client not initialized. Check configuration.");
        }
    }

    /**
     * Get error suggestion based on error type
     * @param {Error} error - Error object
     * @returns {string} Error suggestion
     */
    getErrorSuggestion(error) {
        const message = error.message?.toLowerCase() || "";

        if (message.includes("eai_again") || message.includes("getaddrinfo")) {
            return "DNS resolution failed. Check your Confluence URL and internet connection. Try using the full domain name.";
        } else if (message.includes("econnrefused")) {
            return "Connection refused. Verify your Confluence URL is correct and accessible.";
        } else if (message.includes("401")) {
            return "Authentication failed. Check your username and API token.";
        } else if (message.includes("403")) {
            return "Permission denied. Ensure your account has permission to create/edit pages.";
        } else if (message.includes("404")) {
            return "Space not found. Verify the space key exists and you have access.";
        } else if (message.includes("timeout")) {
            return "Request timeout. Check your network connection and try again.";
        } else {
            return "Check your Confluence configuration and network connection.";
        }
    }

    /**
     * Update configuration and reinitialize client
     * @param {Object} newConfig - New configuration
     */
    updateConfiguration(newConfig) {
        if (newConfig.baseUrl) {
            this.baseUrl = newConfig.baseUrl.replace(/\/$/, "");
        }
        if (newConfig.username) {
            this.username = newConfig.username;
        }
        if (newConfig.apiToken) {
            this.apiToken = newConfig.apiToken;
        }

        this.initializeClient();
        Logger.info("Confluence API client configuration updated");
    }

    /**
     * Check if client is properly configured
     * @returns {boolean} True if configured
     */
    isConfigured() {
        return !!(this.baseUrl && this.username && this.apiToken && this.client);
    }
}

module.exports = ConfluenceApiClient; 