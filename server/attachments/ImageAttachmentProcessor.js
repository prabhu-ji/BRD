const fs = require("fs-extra");
const AttachmentUploader = require("./AttachmentUploader");
const Logger = require("../utils/Logger");

/**
 * Handles image attachment processing and uploading
 */
class ImageAttachmentProcessor {
    /**
     * Upload image attachments from BRD technical data
     * @param {Object} confluenceClient - Confluence API client
     * @param {string} pageId - Page ID to attach to
     * @param {Object} brdData - BRD data containing technical data
     * @param {Object} auth - Authentication credentials
     * @returns {Promise<Object>} - Upload results
     */
    static async uploadImageAttachments(confluenceClient, pageId, brdData, auth) {
        if (!pageId || !brdData.technicalData) {
            Logger.info("No page ID or technical data to upload images");
            return { success: true, uploaded: [] };
        }

        const uploadedFiles = [];
        const failedUploads = [];

        try {
            Logger.info(`Uploading image attachments to page: ${pageId}`);

            // Collect all image files from technical data
            const imageFiles = this.collectImageFiles(brdData.technicalData);

            Logger.info(`Found ${imageFiles.length} image files to upload`);

            if (imageFiles.length === 0) {
                return {
                    success: true,
                    uploaded: [],
                    message: "No images to upload",
                };
            }

            // Process each image file
            for (const imageFile of imageFiles) {
                try {
                    const result = await this.processImageFile(
                        confluenceClient,
                        pageId,
                        imageFile,
                        auth
                    );

                    if (result.success) {
                        uploadedFiles.push(result);
                    } else {
                        failedUploads.push(result);
                    }
                } catch (error) {
                    Logger.error(`Error processing image ${imageFile.name}:`, error.message);
                    failedUploads.push({
                        name: imageFile.name,
                        error: error.message,
                    });
                }
            }

            const result = {
                success: failedUploads.length === 0,
                uploaded: uploadedFiles,
                failed: failedUploads,
                message: `Uploaded ${uploadedFiles.length}/${imageFiles.length} images successfully`,
            };

            if (failedUploads.length > 0) {
                Logger.warn(`Some image uploads failed: ${failedUploads.length}/${imageFiles.length}`);
            } else {
                Logger.success(`All images uploaded successfully: ${uploadedFiles.length}`);
            }

            return result;
        } catch (error) {
            Logger.error("Error in uploadImageAttachments:", error.message);
            return {
                success: false,
                error: error.message,
                uploaded: uploadedFiles,
                failed: failedUploads,
            };
        }
    }

    /**
     * Collect image files from technical data
     * @param {Object} technicalData - Technical data object
     * @returns {Array} - Array of image file objects
     */
    static collectImageFiles(technicalData) {
        const imageFiles = [];

        Object.entries(technicalData).forEach(([sectionName, sectionData]) => {
            if (sectionData && sectionData.files && Array.isArray(sectionData.files)) {
                sectionData.files.forEach((file) => {
                    if (file.fileType === "image" && file.name) {
                        imageFiles.push({
                            ...file,
                            sectionName,
                        });
                    }
                });
            }
        });

        return imageFiles;
    }

    /**
     * Process individual image file
     * @param {Object} confluenceClient - Confluence API client
     * @param {string} pageId - Page ID
     * @param {Object} imageFile - Image file object
     * @param {Object} auth - Authentication credentials
     * @returns {Promise<Object>} - Processing result
     */
    static async processImageFile(confluenceClient, pageId, imageFile, auth) {
        Logger.imageUpload(imageFile.name);

        try {
            // Process file data based on different formats
            const processedData = this.processImageData(imageFile);

            if (processedData.needsStream) {
                // Handle file path uploads
                const fileStream = fs.createReadStream(processedData.path);
                return await AttachmentUploader.uploadFile(
                    confluenceClient,
                    pageId,
                    fileStream,
                    imageFile.name,
                    imageFile.type || "image/jpeg",
                    auth
                );
            } else {
                // Handle buffer/base64 uploads
                return await AttachmentUploader.uploadFile(
                    confluenceClient,
                    pageId,
                    processedData.data,
                    imageFile.name,
                    imageFile.type || "image/jpeg",
                    auth
                );
            }
        } catch (error) {
            Logger.error(`Failed to process image ${imageFile.name}:`, error.message);
            return {
                success: false,
                name: imageFile.name,
                error: error.message,
            };
        }
    }

    /**
     * Process image data from various formats
     * @param {Object} imageFile - Image file object
     * @returns {Object} - Processed image data
     */
    static processImageData(imageFile) {
        if (imageFile.data && typeof imageFile.data === "string") {
            // Base64 encoded image data
            const base64Data = imageFile.data.includes(",")
                ? imageFile.data.split(",")[1]
                : imageFile.data;

            const buffer = Buffer.from(base64Data, "base64");
            return { needsStream: false, data: buffer };
        } else if (imageFile.path && fs.existsSync(imageFile.path)) {
            // File path on disk
            return { needsStream: true, path: imageFile.path };
        } else if (imageFile.buffer && Buffer.isBuffer(imageFile.buffer)) {
            // Direct buffer data
            return { needsStream: false, data: imageFile.buffer };
        } else {
            throw new Error(`No valid image data found for: ${imageFile.name}`);
        }
    }

    /**
     * Validate image file
     * @param {Object} imageFile - Image file object
     * @returns {Object} - Validation result
     */
    static validateImageFile(imageFile) {
        if (!imageFile.name) {
            return { valid: false, error: "Image file must have a name" };
        }

        // Check for valid image extensions
        const validExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg"];
        const extension = imageFile.name.toLowerCase().substring(imageFile.name.lastIndexOf("."));
        
        if (!validExtensions.includes(extension)) {
            return { 
                valid: false, 
                error: `Invalid image extension: ${extension}. Supported: ${validExtensions.join(", ")}` 
            };
        }

        // Check if image data exists in any format
        if (!imageFile.data && !imageFile.path && !imageFile.buffer) {
            return { valid: false, error: "Image file must have data, path, or buffer" };
        }

        return { valid: true };
    }

    /**
     * Get image file info
     * @param {Object} imageFile - Image file object
     * @returns {Object} - Image file information
     */
    static getImageInfo(imageFile) {
        const info = {
            name: imageFile.name,
            section: imageFile.sectionName,
            type: imageFile.type || "image/jpeg",
            description: imageFile.description || "",
        };

        // Try to determine size if possible
        if (imageFile.data && typeof imageFile.data === "string") {
            const base64Data = imageFile.data.includes(",")
                ? imageFile.data.split(",")[1]
                : imageFile.data;
            info.estimatedSize = Math.round(base64Data.length * 0.75); // Rough base64 to bytes conversion
        } else if (imageFile.buffer && Buffer.isBuffer(imageFile.buffer)) {
            info.estimatedSize = imageFile.buffer.length;
        }

        return info;
    }
}

module.exports = ImageAttachmentProcessor; 