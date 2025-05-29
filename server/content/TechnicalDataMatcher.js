const ContentTypeDetector = require('../utils/ContentTypeDetector');
const Logger = require('../utils/Logger');
const TableContentGenerator = require('./TableContentGenerator');
const HtmlUtils = require('../utils/HtmlUtils');

/**
 * Handles matching and processing of technical data with AI-generated sections
 */
class TechnicalDataMatcher {
    /**
     * Find and process technical data for a section
     * @param {string} sectionKey - AI section key
     * @param {Object} technicalData - All technical data
     * @returns {string} - Generated technical content
     */
    static processForSection(sectionKey, technicalData) {
        if (!technicalData || Object.keys(technicalData).length === 0) {
            Logger.info(`No technical data available for processing`);
            return "";
        }

        Logger.technicalDataProcessing(sectionKey);
        Logger.debug(`Available technical data sections:`, Object.keys(technicalData));

        const sectionTechnicalData = this.findMatchingTechnicalData(sectionKey, technicalData);

        if (!sectionTechnicalData) {
            Logger.error(`No matching technical data found for section: "${sectionKey}"`);
            Logger.debug(`Available technical sections: [${Object.keys(technicalData).join(", ")}]`);
            return "";
        }

        return this.generateTechnicalContent(sectionKey, sectionTechnicalData);
    }

    /**
     * Find matching technical data for a section key
     * @param {string} sectionKey - AI section key
     * @param {Object} technicalData - All technical data
     * @returns {Object|null} - Matching technical data or null
     */
    static findMatchingTechnicalData(sectionKey, technicalData) {
        // Try exact match first
        let sectionTechnicalData = technicalData[sectionKey];

        if (sectionTechnicalData) {
            Logger.success(`Found exact technical data match for section: "${sectionKey}"`);
            return sectionTechnicalData;
        }

        // If no exact match, try flexible matching
        const normalizedKey = ContentTypeDetector.normalizeKeyForMatching(sectionKey);
        Logger.debug(`Normalized AI section key for matching: "${normalizedKey}" (original: "${sectionKey}")`);

        for (const [techKey, techData] of Object.entries(technicalData)) {
            Logger.debug(`Comparing AI key: "${sectionKey}" with Technical Data key: "${techKey}"`);
            const normalizedTechKey = ContentTypeDetector.normalizeKeyForMatching(techKey);
            Logger.debug(`Normalized AI key: "${normalizedKey}" vs Normalized Tech key: "${normalizedTechKey}"`);

            if (normalizedKey === normalizedTechKey) {
                Logger.technicalDataMatch(sectionKey, techKey);
                return techData;
            }
        }

        return null;
    }

    /**
     * Generate content from technical data
     * @param {string} sectionName - Section name
     * @param {Object} sectionTechnicalData - Technical data for the section
     * @returns {string} - Generated content
     */
    static generateTechnicalContent(sectionName, sectionTechnicalData) {
        Logger.debug(`Processing technical data for section: ${sectionName}`, {
            hasFiles: !!sectionTechnicalData.files,
            fileCount: sectionTechnicalData.files?.length || 0,
            sectionData: sectionTechnicalData,
        });

        if (!sectionTechnicalData.files || !Array.isArray(sectionTechnicalData.files) || sectionTechnicalData.files.length === 0) {
            Logger.warn(`No files found in technical data for section: ${sectionName}`, sectionTechnicalData.files);
            return "";
        }

        Logger.success(`Adding ${sectionTechnicalData.files.length} technical files to section: ${sectionName}`);

        let content = "";
        sectionTechnicalData.files.forEach((file, index) => {
            Logger.fileProcessing(`${index + 1}: ${file.name}`, file.fileType);
            content += this.processFile(file);
        });

        Logger.success(`Successfully added technical attachments to section: ${sectionName}`);
        return content;
    }

    /**
     * Process individual technical file
     * @param {Object} file - File object
     * @returns {string} - Generated content for the file
     */
    static processFile(file) {
        switch (file.fileType) {
            case "csv":
                return this.processCSVFile(file);
            case "image":
                return this.processImageFile(file);
            default:
                Logger.warn(`Unknown file type: ${file.fileType} for file: ${file.name}`);
                return "";
        }
    }

    /**
     * Process CSV file data
     * @param {Object} file - CSV file object
     * @returns {string} - Generated table content
     */
    static processCSVFile(file) {
        if (!file.tableData) {
            Logger.error(`Invalid table data structure for ${file.name}`);
            return `<p style="color: #999;"><em>Table data format is invalid for ${HtmlUtils.escapeHtml(file.name)}</em></p>\n`;
        }

        Logger.debug("CSV tableData structure:", {
            hasHeaders: !!file.tableData.headers,
            headersLength: file.tableData.headers?.length || 0,
            hasRows: !!file.tableData.rows,
            rowsLength: file.tableData.rows?.length || 0,
            headers: file.tableData.headers,
            firstRow: file.tableData.rows?.[0],
        });

        let content = TableContentGenerator.generateCompactTable(
            file.tableData.headers,
            file.tableData.rows,
            { maxRows: 10, title: file.name }
        );

        // Add description if available
        if (file.description && file.description.trim()) {
            content += `<p style="font-style: italic; font-size: 0.9em; color: #666;">${HtmlUtils.escapeHtml(file.description)}</p>\n`;
        }

        Logger.success(`Successfully generated table for ${file.name}`);
        return content;
    }

    /**
     * Process image file
     * @param {Object} file - Image file object
     * @returns {string} - Generated image content
     */
    static processImageFile(file) {
        const content = HtmlUtils.createImageMacro(file.name, {
            width: "1200",
            centered: true,
            caption: file.description || file.name
        });

        Logger.success(`Successfully generated Confluence image macro for ${file.name}`);
        return content;
    }
}

module.exports = TechnicalDataMatcher;