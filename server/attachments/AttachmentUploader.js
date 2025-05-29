const axios = require("axios");
const FormData = require("form-data");
const Logger = require("../utils/Logger");

/**
 * Common functionality for uploading attachments to Confluence
 */
class AttachmentUploader {
    /**
     * Upload file to Confluence page
     * @param {Object} confluenceClient - Axios client configured for Confluence
     * @param {string} pageId - Page ID to attach to
     * @param {Buffer|Stream} fileData - File data
     * @param {string} filename - File name
     * @param {string} contentType - MIME content type
     * @param {Object} auth - Authentication credentials
     * @returns {Promise<Object>} - Upload result
     */
    static async uploadFile(confluenceClient, pageId, fileData, filename, contentType, auth) {
        try {
            Logger.debug(`Uploading file: ${filename} to page: ${pageId}`);

            // Verify page exists first
            await this.verifyPageExists(confluenceClient, pageId);

            // Create form data for the upload
            const formData = new FormData();
            formData.append("file", fileData, {
                filename: filename,
                contentType: contentType,
            });

            const uploadPath = `/content/${pageId}/child/attachment`;
            Logger.debug(`Upload path: ${confluenceClient.defaults.baseURL}${uploadPath}`);

            // Use direct axios call with form-data headers
            const uploadResponse = await axios.post(
                `${confluenceClient.defaults.baseURL}${uploadPath}`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        "X-Atlassian-Token": "nocheck",
                    },
                    auth: {
                        username: auth.username,
                        password: auth.password,
                    },
                    timeout: 60000, // Longer timeout for file uploads
                }
            );

            if (uploadResponse.status === 200 || uploadResponse.status === 201) {
                const attachment = Array.isArray(uploadResponse.data.results)
                    ? uploadResponse.data.results[0]
                    : uploadResponse.data;

                Logger.success(`Successfully uploaded: ${filename}`);
                return {
                    success: true,
                    filename: filename,
                    attachmentId: attachment?.id,
                    url: attachment?.url,
                    size: fileData.length || 0,
                };
            } else {
                Logger.error(`Upload failed with status: ${uploadResponse.status}`);
                return {
                    success: false,
                    error: `HTTP ${uploadResponse.status}`,
                    filename: filename,
                };
            }
        } catch (error) {
            Logger.error(`Error uploading ${filename}:`, error.message);
            Logger.debug(`Upload error details:`, {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
            });

            return {
                success: false,
                error: `${error.response?.status || "Unknown"}: ${error.message}`,
                filename: filename,
            };
        }
    }

    /**
     * Verify that the target page exists
     * @param {Object} confluenceClient - Axios client
     * @param {string} pageId - Page ID to verify
     * @returns {Promise<Object>} - Page info if exists
     */
    static async verifyPageExists(confluenceClient, pageId) {
        try {
            const pageCheck = await confluenceClient.get(`/content/${pageId}`);
            Logger.success(`Page verified: ${pageCheck.data.title} (ID: ${pageId})`);
            return pageCheck.data;
        } catch (pageError) {
            Logger.error(`Page verification failed:`, pageError.response?.data || pageError.message);
            throw new Error(`Page ${pageId} not found or not accessible`);
        }
    }

    /**
     * Batch upload multiple files
     * @param {Object} confluenceClient - Axios client
     * @param {string} pageId - Page ID to attach to
     * @param {Array} files - Array of file objects with data, filename, contentType
     * @param {Object} auth - Authentication credentials
     * @returns {Promise<Object>} - Batch upload results
     */
    static async uploadMultipleFiles(confluenceClient, pageId, files, auth) {
        const uploadedFiles = [];
        const failedUploads = [];

        Logger.info(`Starting batch upload of ${files.length} files to page: ${pageId}`);

        for (const file of files) {
            try {
                const result = await this.uploadFile(
                    confluenceClient,
                    pageId,
                    file.data,
                    file.filename,
                    file.contentType,
                    auth
                );

                if (result.success) {
                    uploadedFiles.push(result);
                } else {
                    failedUploads.push(result);
                }
            } catch (error) {
                Logger.error(`Batch upload error for ${file.filename}:`, error.message);
                failedUploads.push({
                    success: false,
                    filename: file.filename,
                    error: error.message,
                });
            }
        }

        const result = {
            success: failedUploads.length === 0,
            uploaded: uploadedFiles,
            failed: failedUploads,
            message: `Uploaded ${uploadedFiles.length}/${files.length} files successfully`,
        };

        if (failedUploads.length > 0) {
            Logger.warn(`Some uploads failed: ${failedUploads.length}/${files.length}`);
        } else {
            Logger.success(`All files uploaded successfully: ${uploadedFiles.length}`);
        }

        return result;
    }

    /**
     * Process file data based on different input formats
     * @param {Object} file - File object with various data formats
     * @returns {Object} - Processed file data
     */
    static processFileData(file) {
        let fileData = null;
        
        if (file.data && typeof file.data === "string") {
            // Base64 encoded data
            const base64Data = file.data.includes(",") 
                ? file.data.split(",")[1] 
                : file.data;
            fileData = Buffer.from(base64Data, "base64");
        } else if (file.buffer && Buffer.isBuffer(file.buffer)) {
            // Buffer data
            fileData = file.buffer;
        } else if (file.path && typeof file.path === "string") {
            // File path - will need to be handled by caller with fs.createReadStream
            return { needsStream: true, path: file.path };
        } else {
            throw new Error(`No valid file data found for: ${file.name}`);
        }

        return { 
            needsStream: false, 
            data: fileData 
        };
    }
}

module.exports = AttachmentUploader; 