/**
 * Centralized logging utility with consistent emoji formatting
 */
class Logger {
    static LogLevel = {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3
    };

    constructor(level = Logger.LogLevel.INFO) {
        this.level = level;
    }

    /**
     * Log error message
     * @param {string} message - Error message
     * @param {...any} args - Additional arguments
     */
    static error(message, ...args) {
        console.error(`❌ ${message}`, ...args);
    }

    /**
     * Log warning message
     * @param {string} message - Warning message
     * @param {...any} args - Additional arguments
     */
    static warn(message, ...args) {
        console.warn(`⚠️ ${message}`, ...args);
    }

    /**
     * Log info message
     * @param {string} message - Info message
     * @param {...any} args - Additional arguments
     */
    static info(message, ...args) {
        console.log(`ℹ️ ${message}`, ...args);
    }

    /**
     * Log success message
     * @param {string} message - Success message
     * @param {...any} args - Additional arguments
     */
    static success(message, ...args) {
        console.log(`✅ ${message}`, ...args);
    }

    /**
     * Log debug message
     * @param {string} message - Debug message
     * @param {...any} args - Additional arguments
     */
    static debug(message, ...args) {
        console.log(`🔍 ${message}`, ...args);
    }

    /**
     * Log API request
     * @param {string} method - HTTP method
     * @param {string} url - Request URL
     */
    static apiRequest(method, url) {
        console.log(`🔗 Confluence API Request: ${method.toUpperCase()} ${url}`);
    }

    /**
     * Log API response
     * @param {number} status - Response status
     * @param {string} statusText - Response status text
     */
    static apiResponse(status, statusText) {
        console.log(`✅ Confluence API Response: ${status} ${statusText}`);
    }

    /**
     * Log API error
     * @param {Object} error - Error object
     */
    static apiError(error) {
        console.error("❌ Confluence API Error:", {
            status: error.response?.status,
            statusText: error.response?.statusText,
            message: error.response?.data?.message || error.message,
            url: error.config?.url,
        });
    }

    /**
     * Log content processing
     * @param {string} section - Section name
     * @param {string} type - Content type
     */
    static contentProcessing(section, type) {
        console.log(`📝 Processing section: ${section} (type: ${type})`);
    }

    /**
     * Log AI content detection
     * @param {string} type - Detected AI type
     */
    static aiContentDetected(type) {
        console.log(`🎯 AI object detected with type: ${type}`);
    }

    /**
     * Log smart content processing
     * @param {string} section - Section name
     * @param {string} type - Content type
     */
    static smartContentProcessing(section, type) {
        console.log(`🤖 Processing section: ${section} (type: ${type || "auto"})`);
    }

    /**
     * Log technical data processing
     * @param {string} section - Section name
     */
    static technicalDataProcessing(section) {
        console.log(`🔍 Processing technical data for section: "${section}"`);
    }

    /**
     * Log technical data match
     * @param {string} aiKey - AI section key
     * @param {string} techKey - Technical data key
     */
    static technicalDataMatch(aiKey, techKey) {
        console.log(`✅ Found matching technical data: "${aiKey}" matches "${techKey}"`);
    }

    /**
     * Log file attachment processing
     * @param {string} filename - File name
     * @param {string} type - File type
     */
    static fileProcessing(filename, type) {
        console.log(`📄 Processing file: ${filename}, type: ${type}`);
    }

    /**
     * Log image upload
     * @param {string} filename - Image filename
     */
    static imageUpload(filename) {
        console.log(`📤 Uploading image: ${filename}`);
    }

    /**
     * Log GraphViz processing
     * @param {string} diagramName - Diagram name
     */
    static graphvizProcessing(diagramName) {
        console.log(`🎨 Processing GraphViz diagram: ${diagramName}`);
    }

    /**
     * Log page creation/update
     * @param {string} operation - Operation type (create/update)
     * @param {string} pageId - Page ID
     */
    static pageOperation(operation, pageId) {
        const emoji = operation === 'create' ? '📝' : '🔄';
        console.log(`${emoji} ${operation === 'create' ? 'Creating' : 'Updating'} page: ${pageId}`);
    }

    /**
     * Log page URL
     * @param {string} url - Page URL
     */
    static pageUrl(url) {
        console.log(`🔗 Page URL: ${url}`);
    }

    /**
     * Log connection test
     * @param {string} message - Test message
     */
    static connectionTest(message) {
        console.log(`🔍 ${message}`);
    }

    /**
     * Log content generation completion
     * @param {number} length - Content length
     * @param {number} diagramCount - Number of diagrams
     */
    static contentGenerated(length, diagramCount = 0) {
        console.log(`✅ Generated ${length} characters of content`);
        if (diagramCount > 0) {
            console.log(`🎨 Found ${diagramCount} GraphViz diagrams for rendering`);
        }
    }
}

module.exports = Logger; 