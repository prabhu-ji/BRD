import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
    CheckCircleIcon,
    ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import axios from "axios";
import MermaidSourceViewer from "../components/MermaidSourceViewer";

// Constants
const LOCAL_STORAGE_BRD_INPUT_KEY = "brd_generation_data";
const LOCAL_STORAGE_LAST_RESULT_KEY = "brd_last_generated_result";
const API_ENDPOINT_GENERATE_BRD =
    "http://localhost:5000/api/generate-brd-with-confluence";

function GenerateBRD() {
    const navigate = useNavigate();
    const [brdData, setBrdData] = useState(null);
    const [status, setStatus] = useState("loading"); // loading, generating, success, error, cancelled
    const [progress, setProgress] = useState(0);
    const [generatedDoc, setGeneratedDoc] = useState(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [confluenceConfig, setConfluenceConfig] = useState(null);
    const abortControllerRef = useRef(null);

    // Load BRD data and Confluence configuration
    useEffect(() => {
        const loadData = async () => {
            try {
                // Check URL parameters to distinguish between fresh generation and page refresh
                const urlParams = new URLSearchParams(window.location.search);
                const isNewGeneration = urlParams.get("new") === "true";

                // First, check if we have a previous successful result
                const lastResult = localStorage.getItem(
                    LOCAL_STORAGE_LAST_RESULT_KEY
                );
                const savedData = localStorage.getItem(
                    LOCAL_STORAGE_BRD_INPUT_KEY
                );

                // Only show cached results if it's NOT a new generation request and we have recent data
                if (!isNewGeneration && lastResult && savedData) {
                    try {
                        const parsedResult = JSON.parse(lastResult);
                        const parsedData = JSON.parse(savedData);

                        // Check if the last result is successful and recent (within 10 minutes)
                        if (parsedResult.success && parsedResult.timestamp) {
                            const resultTime = new Date(parsedResult.timestamp);
                            const now = new Date();
                            const timeDiff = (now - resultTime) / 1000 / 60; // minutes

                            if (timeDiff <= 10) {
                                // Only show if within 10 minutes
                                setBrdData(parsedData);
                                setGeneratedDoc(parsedResult);
                                setStatus("success");
                                setProgress(100);
                                console.log(
                                    "Showing cached result from",
                                    parsedResult.timestamp
                                );
                                return; // Skip generation, show the existing result
                            } else {
                                console.log(
                                    "Cached result too old, generating new BRD"
                                );
                            }
                        }
                    } catch (parseError) {
                        console.warn(
                            "Failed to parse stored result, will proceed with new generation:",
                            parseError
                        );
                        // Continue with normal flow if parsing fails
                    }
                }

                // Load BRD data from localStorage
                if (savedData) {
                    setBrdData(JSON.parse(savedData));
                } else {
                    setStatus("error");
                    setErrorMessage(
                        "No BRD data found. Please go back and fill out the form."
                    );
                    return;
                }

                // Load Confluence configuration
                const confluenceResponse = await axios.get(
                    "http://localhost:5000/api/config/confluence"
                );
                setConfluenceConfig(confluenceResponse.data);

                console.log("Starting new BRD generation...");
                setStatus("generating");
            } catch (error) {
                console.error("Error loading configuration:", error);
                setStatus("error");
                setErrorMessage(
                    "Failed to load configuration. Please try again."
                );
            }
        };

        loadData();
    }, []);

    // Auto-start generation when data is loaded
    useEffect(() => {
        if (status === "generating" && brdData && confluenceConfig) {
            generateBRD();
        }
    }, [status, brdData, confluenceConfig]);

    // Convert base64 to File utility
    const base64ToFile = (base64Data, fileName, mimeType) => {
        try {
            const byteCharacters = atob(base64Data.split(",")[1]);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            return new File([byteArray], fileName, { type: mimeType });
        } catch (e) {
            console.error("Error in base64ToFile:", e);
            throw new Error(
                `Failed to decode file data for ${fileName}. Ensure the file data is valid.`
            );
        }
    };

    const generateBRD = async () => {
        // Initialize abort controller for this generation
        abortControllerRef.current = new AbortController();

        try {
            setProgress(5);

            const formData = new FormData();
            formData.append("template", JSON.stringify(brdData.template));
            formData.append("formData", JSON.stringify(brdData.formData));
            formData.append("businessUseCase", brdData.businessUseCase);
            formData.append("businessLogic", brdData.businessLogic);
            formData.append("outputs", JSON.stringify(brdData.outputs));

            // Set publishToConfluence based on saved configuration
            const shouldPublish = confluenceConfig?.enabled === true;
            formData.append(
                "publishToConfluence",
                shouldPublish ? "true" : "false"
            );
            formData.append("confluenceOptions", JSON.stringify({}));

            // Add technical data if available
            if (brdData.technicalData) {
                formData.append(
                    "technicalData",
                    JSON.stringify(brdData.technicalData)
                );
            }

            // Handle legacy file data if present
            if (brdData.imageFileData) {
                formData.append(
                    "image",
                    base64ToFile(
                        brdData.imageFileData.data,
                        brdData.imageFileData.name,
                        brdData.imageFileData.type
                    )
                );
            }

            if (brdData.docFileData) {
                formData.append(
                    "doc",
                    base64ToFile(
                        brdData.docFileData.data,
                        brdData.docFileData.name,
                        brdData.docFileData.type
                    )
                );
            }

            setProgress(10);

            const response = await axios.post(
                API_ENDPOINT_GENERATE_BRD,
                formData,
                {
                    headers: { "Content-Type": "multipart/form-data" },
                    signal: abortControllerRef.current.signal,
                    onUploadProgress: (progressEvent) => {
                        const percentCompleted = Math.round(
                            (progressEvent.loaded * 100) /
                                (progressEvent.total || 1)
                        );
                        setProgress(10 + Math.min(percentCompleted * 0.3, 30));
                    },
                }
            );

            setProgress(40);

            // Simulate backend processing progress
            const progressInterval = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 95) {
                        clearInterval(progressInterval);
                        return 95;
                    }
                    return prev + Math.random() * 15;
                });
            }, 1000);

            // Clear progress interval when response is received
            if (response.data) {
                clearInterval(progressInterval);
                setProgress(100);
            }

            if (response.data.success) {
                setGeneratedDoc(response.data);
                setStatus("success");

                // Store only essential result data for history (avoid localStorage quota issues)
                try {
                    const essentialResult = {
                        success: response.data.success,
                        timestamp: response.data.timestamp,
                        message: response.data.message,
                        fileName: response.data.fileName,
                        downloadUrl: response.data.downloadUrl,
                        diagrams: response.data.diagrams || [], // Include diagram data for Mermaid code
                        confluence: response.data.confluence
                            ? {
                                  success: response.data.confluence.success,
                                  pageTitle: response.data.confluence.pageTitle,
                                  pageUrl: response.data.confluence.pageUrl,
                                  pageId: response.data.confluence.pageId,
                                  spaceKey: response.data.confluence.spaceKey,
                              }
                            : null,
                    };
                    localStorage.setItem(
                        LOCAL_STORAGE_LAST_RESULT_KEY,
                        JSON.stringify(essentialResult)
                    );
                } catch (storageError) {
                    console.warn(
                        "Could not save result to localStorage:",
                        storageError.message
                    );
                    // Don't fail the entire operation if localStorage fails
                }
            } else {
                setStatus("error");
                setErrorMessage(
                    response.data.message || "Unknown error occurred"
                );
            }
        } catch (error) {
            if (error.name === "AbortError") {
                console.log("Request was cancelled");
                return;
            }

            console.error("Generation error:", error);
            setStatus("error");
            setErrorMessage(
                error.response?.data?.message ||
                    error.message ||
                    "Failed to generate BRD"
            );
        }
    };

    const handleCancelGeneration = async () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setStatus("cancelled");
            setErrorMessage("BRD generation has been cancelled by the user.");
            setProgress(0);
        }
    };

    const createNewBRD = () => {
        localStorage.removeItem(LOCAL_STORAGE_BRD_INPUT_KEY);
        localStorage.removeItem(LOCAL_STORAGE_LAST_RESULT_KEY);
        setBrdData(null);
        setGeneratedDoc(null);
        setProgress(0);
        setErrorMessage("");
        navigate("/create-brd");
    };

    const retryGeneration = () => {
        if (brdData) {
            setStatus("generating");
            setProgress(0);
            setErrorMessage("");
            generateBRD();
        }
    };

    const regenerateBRD = () => {
        // Clear the previous result and start a new generation
        localStorage.removeItem(LOCAL_STORAGE_LAST_RESULT_KEY);
        setGeneratedDoc(null);
        setProgress(0);
        setErrorMessage("");
        setStatus("generating");

        // Update URL to indicate new generation
        window.history.replaceState(null, null, "/generate-brd?new=true");
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

                        <button
                            onClick={handleCancelGeneration}
                            className="mt-6 px-6 py-2 bg-red-500 text-white font-semibold rounded-md hover:bg-red-600 transition duration-150 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75"
                        >
                            Cancel Generation
                        </button>
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
                        {generatedDoc.confluence?.success && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                                <div className="flex items-center mb-2">
                                    <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
                                    <h3 className="text-green-800 font-medium">
                                        Published to Confluence
                                    </h3>
                                </div>
                                <p className="text-green-700 text-sm mb-3">
                                    Your BRD has been successfully published to
                                    Confluence.
                                </p>
                                <div className="space-y-1 text-sm">
                                    <div>
                                        <span className="text-green-600 font-medium">
                                            Page Title:
                                        </span>{" "}
                                        <span className="text-green-800">
                                            {generatedDoc.confluence.pageTitle}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-green-600 font-medium">
                                            Space:
                                        </span>{" "}
                                        <span className="text-green-800">
                                            {generatedDoc.confluence.spaceKey}
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

                        {/* Show Mermaid source code if available */}
                        <MermaidSourceViewer diagrams={generatedDoc.diagrams} />

                        <div className="flex justify-center space-x-4">
                            <button
                                onClick={regenerateBRD}
                                className="px-6 py-2 bg-blue-500 text-white font-semibold rounded-md hover:bg-blue-600 transition duration-150"
                            >
                                Generate Again
                            </button>
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
                    <div className="text-center py-12">
                        <ExclamationCircleIcon className="h-16 w-16 text-red-500 mx-auto" />
                        <p className="mt-4 text-xl font-semibold text-gray-800">
                            Generation Failed
                        </p>
                        <p className="mt-2 text-gray-600">{errorMessage}</p>
                        <div className="mt-6 space-x-3">
                            <button
                                onClick={retryGeneration}
                                className="px-6 py-2 bg-blue-500 text-white font-semibold rounded-md hover:bg-blue-600 transition duration-150"
                            >
                                Try Again
                            </button>
                            <button
                                onClick={createNewBRD}
                                className="px-6 py-2 bg-gray-300 text-gray-700 font-semibold rounded-md hover:bg-gray-400 transition duration-150"
                            >
                                Create New BRD
                            </button>
                        </div>
                    </div>
                )}

                {status === "cancelled" && (
                    <div className="text-center py-12">
                        <ExclamationCircleIcon className="h-16 w-16 text-yellow-500 mx-auto" />
                        <p className="mt-4 text-xl font-semibold text-gray-800">
                            Generation Cancelled
                        </p>
                        <p className="mt-2 text-gray-600">{errorMessage}</p>
                        <div className="mt-6 space-x-3">
                            <button
                                onClick={retryGeneration}
                                className="px-6 py-2 bg-blue-500 text-white font-semibold rounded-md hover:bg-blue-600 transition duration-150"
                            >
                                Try Again
                            </button>
                            <button
                                onClick={createNewBRD}
                                className="px-6 py-2 bg-gray-300 text-gray-700 font-semibold rounded-md hover:bg-gray-400 transition duration-150"
                            >
                                Create New BRD
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default GenerateBRD;
