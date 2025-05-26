import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    DocumentTextIcon,
    ArrowDownTrayIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import axios from "axios";

function GenerateBRD() {
    const navigate = useNavigate();
    const [brdData, setBrdData] = useState(null);
    const [status, setStatus] = useState("loading"); // loading, generating, success, error
    const [progress, setProgress] = useState(0);
    const [generatedDoc, setGeneratedDoc] = useState(null);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        // Get the BRD data from localStorage
        try {
            const savedData = localStorage.getItem("brd_generation_data");
            if (savedData) {
                setBrdData(JSON.parse(savedData));
                // Start the generation process
                setStatus("generating");
                startGenerationProcess(JSON.parse(savedData));
            } else {
                setStatus("error");
                setErrorMessage(
                    "No BRD data found. Please create a BRD first."
                );
            }
        } catch (error) {
            console.error("Error loading BRD data:", error);
            setStatus("error");
            setErrorMessage("Failed to load BRD data.");
        }
    }, []);

    const startGenerationProcess = async (data) => {
        // Simulate initial progress while preparing data
        const progressTimer = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 20) {
                    clearInterval(progressTimer);
                    return prev;
                }
                return prev + 5;
            });
        }, 500);

        try {
            // Helper function to convert base64 to File
            const base64ToFile = (base64Data, fileName, mimeType) => {
                const byteCharacters = atob(base64Data.split(",")[1]);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                return new File([byteArray], fileName, { type: mimeType });
            };

            // Create form data for API call
            const formData = new FormData();
            formData.append("template", JSON.stringify(data.template));
            formData.append("formData", JSON.stringify(data.formData));
            formData.append("businessUseCase", data.businessUseCase);
            formData.append("businessLogic", data.businessLogic);
            formData.append("outputs", JSON.stringify(data.outputs));

            // Include technical data as JSON instead of files
            if (data.technicalData) {
                formData.append(
                    "technicalData",
                    JSON.stringify(data.technicalData)
                );
            }

            // Convert base64 data back to files and add to form data
            if (data.imageFileData) {
                const imageFile = base64ToFile(
                    data.imageFileData.data,
                    data.imageFileData.name,
                    data.imageFileData.type
                );
                formData.append("image", imageFile);
            }

            if (data.docFileData) {
                const docFile = base64ToFile(
                    data.docFileData.data,
                    data.docFileData.name,
                    data.docFileData.type
                );
                formData.append("doc", docFile);
            }

            // Choose the appropriate endpoint based on Confluence settings
            const endpoint = "http://localhost:5000/api/generate-brd";

            // Make API call to generate BRD
            const response = await axios.post(endpoint, formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round(
                        (progressEvent.loaded * 100) / progressEvent.total
                    );
                    // Cap at 30% for upload progress
                    setProgress(Math.min(20 + percentCompleted * 0.1, 30));
                },
            });

            // Clear progress timer
            clearInterval(progressTimer);

            // Start generation progress simulation
            const generationTimer = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 95) {
                        clearInterval(generationTimer);
                        return prev;
                    }
                    // Slower progress after 60%
                    const increment = prev < 60 ? 5 : 2;
                    return prev + increment;
                });
            }, 1000);

            if (response.data.success) {
                // Simulate completion
                setTimeout(() => {
                    clearInterval(generationTimer);
                    setProgress(100);
                    setStatus("success");
                    setGeneratedDoc({
                        fileName: response.data.fileName,
                        url: `http://localhost:5000${response.data.downloadUrl}`,
                        timestamp: response.data.timestamp,
                        confluence: response.data.confluence,
                    });
                }, 3000);
            } else {
                throw new Error(
                    response.data.message || "Failed to generate BRD"
                );
            }
        } catch (error) {
            console.error("Error generating BRD:", error);
            setStatus("error");
            setErrorMessage(
                error.response?.data?.message ||
                    error.message ||
                    "Failed to generate BRD. Please try again."
            );
        }
    };

    const downloadDocument = () => {
        if (!generatedDoc || !generatedDoc.url) {
            alert("Document URL not available");
            return;
        }

        // Create a link and trigger download
        const link = document.createElement("a");
        link.href = generatedDoc.url;
        link.setAttribute("download", generatedDoc.fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const createNewBRD = () => {
        navigate("/create-brd");
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900">
                    Generate BRD
                </h1>
            </div>

            <div className="card">
                {status === "loading" && (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">
                            Loading BRD data...
                        </p>
                    </div>
                )}

                {status === "generating" && (
                    <div className="py-8">
                        <h2 className="text-xl font-semibold text-gray-800 mb-6">
                            Generating Your BRD Document
                        </h2>

                        <div className="mb-4">
                            <div className="w-full bg-gray-200 rounded-full h-4">
                                <div
                                    className="bg-blue-600 h-4 rounded-full transition-all duration-500"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                            <p className="text-right text-sm text-gray-600 mt-1">
                                {progress}% Complete
                            </p>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                            <h3 className="text-blue-800 text-sm font-medium mb-2">
                                Processing Steps:
                            </h3>
                            <ul className="space-y-2 text-sm">
                                <li className="flex items-center">
                                    <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                                    <span>
                                        Analyzing business logic and use case
                                    </span>
                                </li>
                                <li className="flex items-center">
                                    <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                                    <span>Processing template structure</span>
                                </li>
                                <li className="flex items-center">
                                    {progress >= 50 ? (
                                        <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                                    ) : (
                                        <div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin mr-2"></div>
                                    )}
                                    <span>
                                        Generating content for selected outputs
                                    </span>
                                </li>
                                <li className="flex items-center">
                                    {progress >= 70 ? (
                                        <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                                    ) : (
                                        <div className="h-5 w-5 rounded-full border-2 border-gray-300 mr-2"></div>
                                    )}
                                    <span>
                                        Formatting document with tables and
                                        images
                                    </span>
                                </li>
                                <li className="flex items-center">
                                    {progress >= 90 ? (
                                        <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                                    ) : (
                                        <div className="h-5 w-5 rounded-full border-2 border-gray-300 mr-2"></div>
                                    )}
                                    <span>
                                        Finalizing document and preparing
                                        download
                                    </span>
                                </li>
                            </ul>
                        </div>

                        <p className="text-sm text-gray-600 mt-4">
                            Please wait while we generate your BRD document.
                            This process may take a few minutes.
                        </p>
                    </div>
                )}

                {status === "success" && generatedDoc && (
                    <div className="py-8">
                        <div className="flex items-center justify-center mb-6">
                            <div className="rounded-full bg-green-100 p-3">
                                <CheckCircleIcon className="h-12 w-12 text-green-600" />
                            </div>
                        </div>

                        <h2 className="text-xl font-semibold text-center text-gray-800 mb-2">
                            Your BRD Document is Ready!
                        </h2>
                        <p className="text-center text-gray-600 mb-8">
                            The document has been successfully generated and is
                            ready for download.
                        </p>

                        {/* Show Confluence success message if published */}
                        {generatedDoc.confluence &&
                            generatedDoc.confluence.success && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                                    <div className="flex items-center mb-2">
                                        <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
                                        <h3 className="text-green-800 font-medium">
                                            Published to Confluence
                                        </h3>
                                    </div>
                                    <p className="text-green-700 text-sm mb-3">
                                        Your BRD has been successfully published
                                        to Confluence.
                                    </p>
                                    <div className="space-y-1 text-sm">
                                        <div>
                                            <span className="text-green-600 font-medium">
                                                Page Title:
                                            </span>{" "}
                                            <span className="text-green-800">
                                                {
                                                    generatedDoc.confluence
                                                        .pageTitle
                                                }
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-green-600 font-medium">
                                                Space:
                                            </span>{" "}
                                            <span className="text-green-800">
                                                {
                                                    generatedDoc.confluence
                                                        .spaceKey
                                                }
                                            </span>
                                        </div>
                                    </div>
                                    <a
                                        href={generatedDoc.confluence.pageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center mt-3 text-green-600 hover:text-green-800 font-medium"
                                    >
                                        View in Confluence →
                                    </a>
                                </div>
                            )}

                        <div className="border border-gray-200 rounded-lg p-6 mb-6 bg-gray-50">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center">
                                    <DocumentTextIcon className="h-8 w-8 text-blue-600 mr-3" />
                                    <div>
                                        <h3 className="font-medium text-gray-900">
                                            {generatedDoc.fileName}
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            Generated on{" "}
                                            {new Date(
                                                generatedDoc.timestamp
                                            ).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={downloadDocument}
                                    className="btn btn-primary flex items-center"
                                >
                                    <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                                    Download
                                </button>
                            </div>

                            {brdData && (
                                <div className="mt-4 border-t border-gray-200 pt-4">
                                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                                        Document Information
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <span className="text-gray-500">
                                                Template:
                                            </span>{" "}
                                            <span className="text-gray-900">
                                                {brdData.template.templateName}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">
                                                Outputs:
                                            </span>{" "}
                                            <span className="text-gray-900">
                                                {brdData.outputs.length}{" "}
                                                sections
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-center">
                            <button
                                onClick={createNewBRD}
                                className="btn btn-secondary"
                            >
                                Create Another BRD
                            </button>
                        </div>
                    </div>
                )}

                {status === "error" && (
                    <div className="py-8 text-center">
                        <div className="flex items-center justify-center mb-6">
                            <div className="rounded-full bg-red-100 p-3">
                                <ExclamationCircleIcon className="h-12 w-12 text-red-600" />
                            </div>
                        </div>

                        <h2 className="text-xl font-semibold text-gray-800 mb-2">
                            Error Generating BRD
                        </h2>
                        <p className="text-gray-600 mb-6">
                            {errorMessage ||
                                "There was an error generating your BRD document. Please try again."}
                        </p>

                        <div className="flex justify-center">
                            <button
                                onClick={createNewBRD}
                                className="btn btn-secondary mr-4"
                            >
                                Back to Create BRD
                            </button>
                            {errorMessage !==
                                "No BRD data found. Please create a BRD first." && (
                                <button
                                    onClick={() => {
                                        if (brdData) {
                                            setStatus("generating");
                                            setProgress(0);
                                            startGenerationProcess(brdData);
                                        }
                                    }}
                                    className="btn btn-primary"
                                >
                                    Try Again
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default GenerateBRD;
