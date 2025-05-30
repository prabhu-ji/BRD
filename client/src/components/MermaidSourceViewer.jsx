import { useState } from "react";
import {
    CodeBracketIcon,
    DocumentArrowDownIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ClipboardIcon,
    CheckIcon,
} from "@heroicons/react/24/outline";

/**
 * Component for displaying and downloading Mermaid source code
 * Allows users to view, copy, and download Mermaid diagrams for manual editing
 */
function MermaidSourceViewer({ diagrams = [] }) {
    const [expandedDiagrams, setExpandedDiagrams] = useState(new Set());
    const [copiedDiagrams, setCopiedDiagrams] = useState(new Set());

    // Filter to only show Mermaid diagrams
    const mermaidDiagrams = diagrams.filter(
        (diagram) => diagram.type === "mermaid" && diagram.mermaidCode
    );

    if (mermaidDiagrams.length === 0) {
        return null; // Don't show anything if no Mermaid diagrams
    }

    const toggleExpanded = (diagramId) => {
        setExpandedDiagrams((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(diagramId)) {
                newSet.delete(diagramId);
            } else {
                newSet.add(diagramId);
            }
            return newSet;
        });
    };

    const copyToClipboard = async (diagramId, mermaidCode) => {
        try {
            await navigator.clipboard.writeText(mermaidCode);
            setCopiedDiagrams((prev) => new Set(prev).add(diagramId));

            // Remove the copied state after 2 seconds
            setTimeout(() => {
                setCopiedDiagrams((prev) => {
                    const newSet = new Set(prev);
                    newSet.delete(diagramId);
                    return newSet;
                });
            }, 2000);
        } catch (error) {
            console.error("Failed to copy to clipboard:", error);
        }
    };

    const downloadMermaidFile = (diagramName, mermaidCode) => {
        // Create a blob with the Mermaid code
        const blob = new Blob([mermaidCode], { type: "text/plain" });
        const url = URL.createObjectURL(blob);

        // Create a temporary download link
        const link = document.createElement("a");
        link.href = url;
        link.download = `${diagramName.replace(/[^a-zA-Z0-9]/g, "_")}.mmd`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the URL object
        URL.revokeObjectURL(url);
    };

    const downloadAllMermaidFiles = () => {
        mermaidDiagrams.forEach((diagram) => {
            setTimeout(() => {
                downloadMermaidFile(diagram.diagramName, diagram.mermaidCode);
            }, 100); // Small delay between downloads to avoid browser blocking
        });
    };

    return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                    <CodeBracketIcon className="h-6 w-6 text-blue-600 mr-2" />
                    <h3 className="text-blue-800 font-semibold text-lg">
                        Mermaid Source Code
                    </h3>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-blue-600 text-sm">
                        {mermaidDiagrams.length} diagram
                        {mermaidDiagrams.length !== 1 ? "s" : ""}
                    </span>
                    {mermaidDiagrams.length > 1 && (
                        <button
                            onClick={downloadAllMermaidFiles}
                            className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition duration-150"
                        >
                            <DocumentArrowDownIcon className="h-4 w-4 mr-1" />
                            Download All
                        </button>
                    )}
                </div>
            </div>

            <p className="text-blue-700 text-sm mb-4">
                Download the Mermaid source code to edit diagrams manually in
                draw.io or other Mermaid-compatible tools.
            </p>

            <div className="space-y-3">
                {mermaidDiagrams.map((diagram) => {
                    const isExpanded = expandedDiagrams.has(diagram.diagramId);
                    const isCopied = copiedDiagrams.has(diagram.diagramId);

                    return (
                        <div
                            key={diagram.diagramId}
                            className="bg-white border border-blue-200 rounded-md"
                        >
                            <div className="flex items-center justify-between p-3 bg-blue-25 border-b border-blue-200">
                                <div className="flex items-center">
                                    <button
                                        onClick={() =>
                                            toggleExpanded(diagram.diagramId)
                                        }
                                        className="flex items-center text-blue-800 hover:text-blue-900 font-medium"
                                    >
                                        {isExpanded ? (
                                            <ChevronUpIcon className="h-4 w-4 mr-1" />
                                        ) : (
                                            <ChevronDownIcon className="h-4 w-4 mr-1" />
                                        )}
                                        {diagram.diagramName}
                                    </button>
                                    <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                                        Mermaid
                                    </span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={() =>
                                            copyToClipboard(
                                                diagram.diagramId,
                                                diagram.mermaidCode
                                            )
                                        }
                                        className="inline-flex items-center px-2 py-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded hover:bg-blue-50 transition duration-150"
                                    >
                                        {isCopied ? (
                                            <>
                                                <CheckIcon className="h-3 w-3 mr-1" />
                                                Copied!
                                            </>
                                        ) : (
                                            <>
                                                <ClipboardIcon className="h-3 w-3 mr-1" />
                                                Copy
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={() =>
                                            downloadMermaidFile(
                                                diagram.diagramName,
                                                diagram.mermaidCode
                                            )
                                        }
                                        className="inline-flex items-center px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition duration-150"
                                    >
                                        <DocumentArrowDownIcon className="h-3 w-3 mr-1" />
                                        Download
                                    </button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="p-3">
                                    <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-800 overflow-x-auto">
                                        <code>{diagram.mermaidCode}</code>
                                    </pre>
                                    <div className="mt-2 text-xs text-gray-600">
                                        <p className="mb-1">
                                            <strong>How to edit:</strong>
                                        </p>
                                        <ul className="list-disc list-inside space-y-1 ml-2">
                                            <li>
                                                Copy the code above or download
                                                the .mmd file
                                            </li>
                                            <li>
                                                Open{" "}
                                                <a
                                                    href="https://app.diagrams.net/"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    draw.io
                                                </a>{" "}
                                                and navigate to "Arrange" &gt;
                                                "Insert" &gt; "Mermaid"
                                            </li>
                                            <li>
                                                Paste the Mermaid code to edit
                                                the diagram visually
                                            </li>
                                            <li>
                                                Export as PNG/SVG when finished
                                                editing
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default MermaidSourceViewer;
