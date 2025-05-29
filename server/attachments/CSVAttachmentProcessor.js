const AttachmentUploader = require("./AttachmentUploader");
const Logger = require("../utils/Logger");

/**
 * Handles CSV attachment processing and uploading
 */
class CSVAttachmentProcessor {
    /**
     * Upload CSV attachments from BRD technical data
     * @param {Object} confluenceClient - Confluence API client
     * @param {string} pageId - Page ID to attach to
     * @param {Object} brdData - BRD data containing technical data
     * @param {Object} auth - Authentication credentials
     * @returns {Promise<Object>} - Upload results
     */
    static async uploadCSVAttachments(confluenceClient, pageId, brdData, auth) {
        if (!pageId || !brdData.technicalData) {
            Logger.info("No page ID or technical data to upload CSV files");
            return { success: true, uploaded: [] };
        }

        const uploadedFiles = [];
        const failedUploads = [];

        try {
            Logger.info(`Uploading CSV attachments to page: ${pageId}`);

            // Collect all CSV attachment files from technical data
            const csvFiles = this.collectCSVAttachments(brdData.technicalData);

            Logger.info(`Found ${csvFiles.length} CSV attachment files to upload`);

            if (csvFiles.length === 0) {
                return {
                    success: true,
                    uploaded: [],
                    message: "No CSV attachments to upload",
                };
            }

            // Process each CSV file
            for (const csvFile of csvFiles) {
                try {
                    const result = await this.processCSVFile(
                        confluenceClient,
                        pageId,
                        csvFile,
                        auth
                    );

                    if (result.success) {
                        uploadedFiles.push(result);
                    } else {
                        failedUploads.push(result);
                    }
                } catch (error) {
                    Logger.error(`Error processing CSV ${csvFile.name}:`, error.message);
                    failedUploads.push({
                        name: csvFile.name,
                        error: error.message,
                    });
                }
            }

            const result = {
                success: failedUploads.length === 0,
                uploaded: uploadedFiles,
                failed: failedUploads,
                message: `Uploaded ${uploadedFiles.length}/${csvFiles.length} CSV files successfully`,
            };

            if (failedUploads.length > 0) {
                Logger.warn(`Some CSV uploads failed: ${failedUploads.length}/${csvFiles.length}`);
            } else {
                Logger.success(`All CSV files uploaded successfully: ${uploadedFiles.length}`);
            }

            return result;
        } catch (error) {
            Logger.error("Error in uploadCSVAttachments:", error.message);
            return {
                success: false,
                error: error.message,
                uploaded: uploadedFiles,
                failed: failedUploads,
            };
        }
    }

    /**
     * Collect CSV attachment files from technical data
     * @param {Object} technicalData - Technical data object
     * @returns {Array} Array of CSV attachment file objects
     */
    static collectCSVAttachments(technicalData) {
        const csvFiles = [];
        
        Object.entries(technicalData).forEach(([sectionName, sectionData]) => {
            if (sectionData && sectionData.files && Array.isArray(sectionData.files)) {
                sectionData.files.forEach((file) => {
                    // Only collect CSV files that are marked as attachments
                    if (file.fileType === "csv" && file.isAttachment && file.name) {
                        csvFiles.push({
                            ...file,
                            sectionName,
                        });
                    }
                });
            }
        });

        return csvFiles;
    }

    /**
     * Process individual CSV file
     * @param {Object} confluenceClient - Confluence API client
     * @param {string} pageId - Page ID
     * @param {Object} csvFile - CSV file object
     * @param {Object} auth - Authentication credentials
     * @returns {Promise<Object>} - Processing result
     */
    static async processCSVFile(confluenceClient, pageId, csvFile, auth) {
        Logger.info(`📤 Uploading CSV attachment: ${csvFile.name}`);

        try {
            // Process file data based on different formats
            const processedData = this.processCSVData(csvFile);

            // Upload using AttachmentUploader
            return await AttachmentUploader.uploadFile(
                confluenceClient,
                pageId,
                processedData.data,
                csvFile.name,
                csvFile.type || "text/csv",
                auth
            );
        } catch (error) {
            Logger.error(`Failed to process CSV ${csvFile.name}:`, error.message);
            return {
                success: false,
                name: csvFile.name,
                error: error.message,
            };
        }
    }

    /**
     * Process CSV file data for upload
     * @param {Object} csvFile - CSV file object
     * @returns {Object} Processed data object
     */
    static processCSVData(csvFile) {
        if (!csvFile.data) {
            throw new Error("No file data found");
        }

        // Handle base64 encoded CSV data
        if (typeof csvFile.data === "string") {
            const base64Data = csvFile.data.includes(",")
                ? csvFile.data.split(",")[1]
                : csvFile.data;

            const buffer = Buffer.from(base64Data, "base64");
            return {
                data: buffer,
                needsStream: false,
            };
        }

        throw new Error("Unsupported file data format");
    }
}

module.exports = CSVAttachmentProcessor; 