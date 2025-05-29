import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import {
    DocumentTextIcon,
    CheckCircleIcon,
    PlusIcon,
    XMarkIcon,
    TableCellsIcon,
    PhotoIcon,
    ExclamationTriangleIcon,
    ChevronUpDownIcon,
    ArrowRightIcon,
    TrashIcon,
    ListBulletIcon,
} from "@heroicons/react/24/outline";
import axios from "axios";

// Constants
const SECTIONS = [
    { key: "overview", label: "Overview", step: 1 },
    { key: "technical", label: "Technical", step: 2 },
    { key: "business", label: "Business", step: 3 },
    { key: "outputs", label: "Outputs", step: 4 },
];

const API_BASE_URL = "http://localhost:5000/api";

function CreateBRDEditorPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { mode, templateId, templateName } = location.state || {}; // mode: 'ad-hoc' or 'template'

    // Core state
    const [selectedTemplate, setSelectedTemplate] = useState(null); // Stores the full template object if mode is 'template'
    const [isAdHocMode, setIsAdHocMode] = useState(mode === "ad-hoc");
    const [pageTitle, setPageTitle] = useState("Build BRD");

    const [formData, setFormData] = useState({});
    const [adHocOverviewFields, setAdHocOverviewFields] = useState([]);
    const [availableInputsConfig, setAvailableInputsConfig] = useState({});
    const [showAddFieldPanel, setShowAddFieldPanel] = useState(false);
    const [pendingOverviewFields, setPendingOverviewFields] = useState(
        new Set()
    );

    const [businessUseCase, setBusinessUseCase] = useState("");
    const [businessLogic, setBusinessLogic] = useState("");

    const [csvUploadChoice, setCsvUploadChoice] = useState({
        showPrompt: false,
        file: null,
        sectionId: null,
        resolvePromise: null,
    });

    // Navigation state
    const [activeSectionKey, setActiveSectionKey] = useState(SECTIONS[0].key);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);

    // Technical files state
    const [technicalFiles, setTechnicalFiles] = useState({});

    // Loading and UI state
    const [isLoading, setIsLoading] = useState(true); // For loading template data or initial configs
    const [showOutputDropdown, setShowOutputDropdown] = useState(false);

    // Outputs state
    const [outputs, setOutputs] = useState([]);
    const [availableOutputs, setAvailableOutputs] = useState({});
    const [pendingOutputSections, setPendingOutputSections] = useState(
        new Set()
    );

    // Other UI state
    const [movingOutput, setMovingOutput] = useState(null);
    const [businessFormErrors, setBusinessFormErrors] = useState({
        useCase: "",
        logic: "",
    });
    const [isOutputDropdownOpen, setIsOutputDropdownOpen] = useState(false);
    const addOutputButtonRef = useRef(null);
    const dropdownRef = useRef(null);

    // Fetch initial data (available inputs, available outputs, and specific template if in template mode)
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const commonPromises = [
                    axios.get(`${API_BASE_URL}/config/outputs`),
                    axios.get(`${API_BASE_URL}/config/inputs`),
                ];

                if (mode === "template" && templateId) {
                    setPageTitle(`${templateName || "Loading..."}`);
                    const templatePromise = axios
                        .get(`${API_BASE_URL}/config/templates`)
                        .then((res) => {
                            const foundTemplate = res.data.find(
                                (t) => t.id === templateId
                            );
                            if (foundTemplate) {
                                setSelectedTemplate(foundTemplate);
                                // Initialize form data based on template
                                const initialFormData = {};
                                foundTemplate.overview.forEach((input) => {
                                    initialFormData[input.key] =
                                        input.default || "";
                                });
                                setFormData(initialFormData);

                                // Initialize outputs based on template
                                const initialOutputs = Object.keys(
                                    foundTemplate.outputs
                                ).map((key) => ({
                                    id: key,
                                    name: key,
                                    types: foundTemplate.outputs[key],
                                }));
                                setOutputs(initialOutputs);
                                setTechnicalFiles({});
                                if (templateName)
                                    setPageTitle(`${templateName}`);
                            } else {
                                console.error(
                                    "Template not found:",
                                    templateId
                                );
                                navigate("/create-brd", {
                                    replace: true,
                                    state: { error: "Template not found" },
                                });
                            }
                            return foundTemplate; // This is just to make Promise.all work with it
                        });
                    commonPromises.unshift(templatePromise); // Add template promise to the beginning
                } else if (mode === "ad-hoc") {
                    setIsAdHocMode(true);
                    setPageTitle("Build Ad-Hoc BRD");
                    setOutputs([]); // Start with no outputs for ad-hoc
                    setTechnicalFiles({});
                } else {
                    // Invalid mode or missing data, redirect
                    console.warn(
                        "Invalid mode or missing data for BRD builder page. Mode:",
                        mode,
                        "Template ID:",
                        templateId
                    );
                    navigate("/create-brd", { replace: true });
                    return;
                }

                const [
                    ,
                    /* templateDataOrUndefined */ outputsResponse,
                    inputsResponse,
                ] = await Promise.all(
                    mode === "template"
                        ? commonPromises
                        : [Promise.resolve(undefined), ...commonPromises]
                );

                setAvailableOutputs(outputsResponse.data || {});
                setAvailableInputsConfig(inputsResponse.data || {});
            } catch (error) {
                console.error("Error loading data for BRD builder:", error);
                // Handle error display or redirect
            } finally {
                setIsLoading(false);
            }
        };

        if (!location.state || !mode) {
            console.warn(
                "BRD builder page accessed without state. Redirecting."
            );
            navigate("/create-brd", { replace: true });
            return;
        }

        fetchData();
    }, [mode, templateId, templateName, navigate, location.state]);

    // Input change handlers
    const handleInputChange = (key, value) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
    };

    // Ad-Hoc field management - MODIFIED FOR MULTI-SELECT
    const togglePendingOverviewField = (fieldKey) => {
        setPendingOverviewFields((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(fieldKey)) {
                newSet.delete(fieldKey);
            } else {
                newSet.add(fieldKey);
            }
            return newSet;
        });
    };

    const applyPendingOverviewFields = () => {
        const newFieldsToAdd = [];
        const newFormDataEntries = {};

        pendingOverviewFields.forEach((fieldKey) => {
            if (
                availableInputsConfig[fieldKey] &&
                !adHocOverviewFields.find((f) => f.key === fieldKey)
            ) {
                const newField = {
                    key: fieldKey,
                    label: fieldKey,
                    type: availableInputsConfig[fieldKey],
                    default: getDefaultValueForInputType(
                        availableInputsConfig[fieldKey]
                    ),
                };
                newFieldsToAdd.push(newField);
                newFormDataEntries[newField.key] = newField.default || "";
            }
        });

        if (newFieldsToAdd.length > 0) {
            setAdHocOverviewFields((prev) => [...prev, ...newFieldsToAdd]);
            setFormData((prev) => ({ ...prev, ...newFormDataEntries }));
        }

        setShowAddFieldPanel(false);
        setPendingOverviewFields(new Set()); // Clear pending selections
    };

    const handleRemoveAdHocField = (fieldKey) => {
        setAdHocOverviewFields((prev) =>
            prev.filter((field) => field.key !== fieldKey)
        );
        setFormData((prev) => {
            const { [fieldKey]: _, ...rest } = prev;
            return rest;
        });
    };

    const handleAdHocFieldDragEnd = (result) => {
        if (!result.destination) return;
        const items = Array.from(adHocOverviewFields);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        setAdHocOverviewFields(items);
    };

    const getDefaultValueForInputType = (type) => {
        if (typeof type === "object") {
            if (type.type === "dropdown_multi") return [];
            if (
                type.type === "dropdown_single" &&
                type.options &&
                type.options.length > 0
            )
                return type.options[0];
        }
        if (type === "date") return new Date().toISOString().split("T")[0];
        return "";
    };

    const handleBusinessInputChange = (fieldName, value) => {
        if (fieldName === "businessUseCase") {
            setBusinessUseCase(value);
            if (value.trim()) {
                setBusinessFormErrors((prev) => ({ ...prev, useCase: "" }));
            }
        } else if (fieldName === "businessLogic") {
            setBusinessLogic(value);
            if (value.trim()) {
                setBusinessFormErrors((prev) => ({ ...prev, logic: "" }));
            }
        }
    };

    const convertCsvToTable = async (file) => {
        const formData = new FormData();
        formData.append("csv", file);
        try {
            const response = await axios.post(
                `${API_BASE_URL}/convert-csv`,
                formData,
                {
                    headers: { "Content-Type": "multipart/form-data" },
                }
            );
            return response.data;
        } catch (error) {
            console.error("Error converting CSV:", error);
            return {
                success: false,
                error: "Network error: Could not process CSV file",
            };
        }
    };

    const handleFileUpload = async (sectionId, e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const section = technicalFiles[sectionId];
        if (
            (section.type === "image" || section.type === "csv") &&
            outputs.length === 0
        ) {
            // Simplified condition, applies to both modes if outputs are needed
            alert(
                "Please add an Output Section before uploading tables or images."
            );
            e.target.value = "";
            return;
        }

        if (!section || !section.outputSection) {
            alert(
                "Please select an output section first for this technical area."
            );
            e.target.value = "";
            return;
        }

        for (const file of files) {
            const fileId = `${Date.now()}_${Math.random()
                .toString(36)
                .substr(2, 9)}`;
            let previewData = null;
            let addAsContent = true; // Default to content, attachment is an explicit choice via modal

            // Show modal for CSV uploads in BOTH ad-hoc and template mode
            if (section.type === "csv") {
                const userChoice = await new Promise((resolve) => {
                    setCsvUploadChoice({
                        showPrompt: true,
                        file: file,
                        sectionId: sectionId,
                        resolvePromise: resolve,
                    });
                });

                // Reset modal state immediately
                setCsvUploadChoice({
                    showPrompt: false,
                    file: null,
                    sectionId: null,
                    resolvePromise: null,
                });

                if (userChoice === "cancel" || userChoice === null) {
                    // Handle modal close or explicit cancel
                    continue; // Skip this file
                }
                if (userChoice === "attachment") {
                    addAsContent = false;
                }
                // if userChoice is 'content', addAsContent remains true (default)
            }

            if (addAsContent) {
                if (section.type === "csv") {
                    const csvResult = await convertCsvToTable(file);
                    if (csvResult.success) {
                        previewData = csvResult.tableData;
                    } else {
                        alert(`Error processing CSV: ${csvResult.error}`);
                        e.target.value = ""; // Clear file input in case of error with one file in a multi-select
                        continue; // Skip this file
                    }
                } else if (section.type === "image") {
                    previewData = URL.createObjectURL(file);
                }
            } // else, it's an attachment, previewData remains null

            setTechnicalFiles((prev) => ({
                ...prev,
                [sectionId]: {
                    ...prev[sectionId],
                    files: [
                        ...prev[sectionId].files,
                        {
                            id: fileId,
                            file: file,
                            description: "",
                            previewData: previewData, // Will be null for attachments
                            isAttachment: !addAsContent, // Set based on choice
                        },
                    ],
                },
            }));
        }
        e.target.value = ""; // Clear file input after all files are processed (or attempted)
    };

    const handleOutputSectionChange = (sectionId, outputSection) => {
        setTechnicalFiles((prev) => ({
            ...prev,
            [sectionId]: { ...prev[sectionId], outputSection },
        }));
    };

    const handleFileDescriptionChange = (sectionId, fileId, description) => {
        setTechnicalFiles((prev) => ({
            ...prev,
            [sectionId]: {
                ...prev[sectionId],
                files: prev[sectionId].files.map((f) =>
                    f.id === fileId ? { ...f, description } : f
                ),
            },
        }));
    };

    const handleRemoveFile = (sectionId, fileId) => {
        setTechnicalFiles((prev) => {
            const section = prev[sectionId];
            const removedFile = section.files.find((f) => f.id === fileId);
            if (
                removedFile &&
                section.type === "image" &&
                removedFile.previewData &&
                !removedFile.isAttachment
            ) {
                URL.revokeObjectURL(removedFile.previewData);
            }
            return {
                ...prev,
                [sectionId]: {
                    ...prev[sectionId],
                    files: prev[sectionId].files.filter((f) => f.id !== fileId),
                },
            };
        });
    };

    const addTechnicalSection = (type) => {
        const existingSections = Object.keys(technicalFiles).filter(
            (key) => technicalFiles[key].type === type
        );
        const newSectionId = `${type}_${existingSections.length + 1}`;
        let defaultOutputSection = "";
        if (outputs.length > 0) {
            // Prioritize user-defined outputs if available (for Ad-Hoc or if template outputs were modified)
            defaultOutputSection = outputs[0].id;
        } else if (
            selectedTemplate &&
            selectedTemplate.outputs &&
            Object.keys(selectedTemplate.outputs).length > 0
        ) {
            defaultOutputSection = Object.keys(selectedTemplate.outputs)[0];
        }

        setTechnicalFiles((prev) => ({
            ...prev,
            [newSectionId]: {
                type: type,
                outputSection: defaultOutputSection,
                files: [],
            },
        }));
    };

    const removeTechnicalSection = (sectionId) => {
        setTechnicalFiles((prev) => {
            const section = prev[sectionId];
            if (section?.type === "image") {
                section.files.forEach((fileObj) => {
                    if (fileObj.previewData && !fileObj.isAttachment)
                        URL.revokeObjectURL(fileObj.previewData);
                });
            }
            const { [sectionId]: _, ...rest } = prev;
            return rest;
        });
    };

    const handleDragEnd = (result) => {
        // For Outputs reordering
        if (!result.destination) return;
        const items = Array.from(outputs);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        setOutputs(items);
    };

    const togglePendingOutputSection = (sectionKey) => {
        setPendingOutputSections((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(sectionKey)) {
                newSet.delete(sectionKey);
            } else {
                newSet.add(sectionKey);
            }
            return newSet;
        });
    };

    const applyPendingOutputSections = () => {
        const newSectionsToAdd = [];
        pendingOutputSections.forEach((key) => {
            // Check if the section is not already in the main 'outputs' array
            if (
                !outputs.find((output) => output.id === key) &&
                availableOutputs[key]
            ) {
                newSectionsToAdd.push({
                    id: key,
                    name: key, // Assuming key is the name, adjust if displayName is preferred from availableOutputs
                    types: availableOutputs[key], // This should be an array like ['content', 'image']
                });
            }
        });

        if (newSectionsToAdd.length > 0) {
            setOutputs((prevOutputs) => [...prevOutputs, ...newSectionsToAdd]);
        }

        setPendingOutputSections(new Set()); // Clear pending selections
        setIsOutputDropdownOpen(false); // Close the dropdown
    };

    const handleToggleSelectAllPendingOutputSections = () => {
        const availableToAdd = getAvailableOutputsToAdd();
        if (
            pendingOutputSections.size === availableToAdd.length &&
            availableToAdd.length > 0
        ) {
            setPendingOutputSections(new Set());
        } else {
            setPendingOutputSections(new Set(availableToAdd));
        }
    };

    const removeOutput = (id) => {
        setOutputs((prev) => prev.filter((output) => output.id !== id));
    };

    const validateBusinessFields = () => {
        const errors = { useCase: "", logic: "" };
        let isValid = true;
        if (!businessUseCase.trim()) {
            errors.useCase = "Business Use Case is required.";
            isValid = false;
        }
        if (!businessLogic.trim()) {
            errors.logic = "Business Logic is required.";
            isValid = false;
        }
        setBusinessFormErrors(errors);
        return isValid;
    };

    const handleNextClick = () => {
        const currentSectionIndex = SECTIONS.findIndex(
            (s) => s.key === activeSectionKey
        );

        // If on the Business step, validate before proceeding (applies to both modes)
        if (activeSectionKey === "business" && !validateBusinessFields())
            return;

        // No other intermediate locks for Ad-Hoc mode based on previous step completion.

        if (currentSectionIndex < SECTIONS.length - 1) {
            const nextSection = SECTIONS[currentSectionIndex + 1];
            setActiveSectionKey(nextSection.key);
            setCurrentStepIndex(
                Math.max(currentStepIndex, currentSectionIndex + 1)
            );
            // Clear business errors only if they were actually valid and now moving away
            if (businessUseCase.trim() && businessLogic.trim())
                setBusinessFormErrors({ useCase: "", logic: "" });
        } else {
            // Final step, about to generate
            if (!validateBusinessFields()) {
                // This validation MUST pass for generation in all modes
                setActiveSectionKey("business"); // Force focus to business section if invalid
                return;
            }
            handleSubmit();
        }
    };

    const handleSectionClick = (targetSectionKey) => {
        const targetSectionIndex = SECTIONS.findIndex(
            (s) => s.key === targetSectionKey
        );
        const currentSectionIndex = SECTIONS.findIndex(
            (s) => s.key === activeSectionKey
        );

        // If currently on Business step and trying to move forward to a later step, validate (applies to both modes)
        if (
            activeSectionKey === "business" &&
            targetSectionIndex > currentSectionIndex &&
            !validateBusinessFields()
        )
            return;

        // For non-Ad-Hoc mode, if trying to click on Outputs and Business step is not yet valid, prevent & show error.
        if (!isAdHocMode) {
            const businessSectionIndex = SECTIONS.findIndex(
                (s) => s.key === "business"
            );
            const outputsSectionIndex = SECTIONS.findIndex(
                (s) => s.key === "outputs"
            );
            if (
                targetSectionIndex === outputsSectionIndex &&
                currentSectionIndex <= businessSectionIndex &&
                !validateBusinessFields()
            ) {
                setBusinessFormErrors({
                    useCase: !businessUseCase.trim()
                        ? "Business Use Case is required."
                        : "",
                    logic: !businessLogic.trim()
                        ? "Business Logic is required."
                        : "",
                });
                setActiveSectionKey("business"); // Force view to Business section
                setCurrentStepIndex(
                    Math.max(currentStepIndex, businessSectionIndex)
                );
                return;
            }
        }
        // For Ad-Hoc mode, no such restriction, allow direct click to any step.

        setActiveSectionKey(targetSectionKey);
        setCurrentStepIndex(Math.max(currentStepIndex, targetSectionIndex));
        // Clear business errors only if they were actually valid and now moving away or to a valid step
        if (businessUseCase.trim() && businessLogic.trim())
            setBusinessFormErrors({ useCase: "", logic: "" });
    };

    const handleOutputMoveKeyDown = (e, outputId) => {
        if (movingOutput !== outputId) return;
        e.preventDefault();
        const currentIndex = outputs.findIndex((o) => o.id === outputId);
        let newIndex = currentIndex;
        if (e.key === "ArrowUp") newIndex = Math.max(0, currentIndex - 1);
        else if (e.key === "ArrowDown")
            newIndex = Math.min(outputs.length - 1, currentIndex + 1);
        else if (e.key === "Enter" || e.key === "Escape") {
            setMovingOutput(null);
            return;
        }
        if (newIndex !== currentIndex) {
            const newOutputs = Array.from(outputs);
            const [movedItem] = newOutputs.splice(currentIndex, 1);
            newOutputs.splice(newIndex, 0, movedItem);
            setOutputs(newOutputs);
        }
    };

    const handleClickOutside = useCallback(
        (event) => {
            if (
                isOutputDropdownOpen &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target) &&
                addOutputButtonRef.current &&
                !addOutputButtonRef.current.contains(event.target)
            ) {
                setIsOutputDropdownOpen(false);
                setPendingOutputSections(new Set());
            }
            if (movingOutput) {
                const movingElement = document.querySelector(
                    `[data-output-id="${movingOutput}"]`
                );
                if (movingElement && !movingElement.contains(event.target))
                    setMovingOutput(null);
            }
            if (showAddFieldPanel) {
                // Assuming addFieldButtonRef and addFieldPanelRef are defined and used similarly if this logic is active
                // For now, this part is kept as it was, assuming it's handled or will be handled separately
            }
        },
        [isOutputDropdownOpen, movingOutput, showAddFieldPanel]
    );

    useEffect(() => {
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, [handleClickOutside]);

    const handleSubmit = async () => {
        try {
            const selectedOutputsList = outputs.map((output) => ({
                name: output.name,
                types: output.types,
            }));

            const processedTechnicalData = {};
            for (const sectionId in technicalFiles) {
                const section = technicalFiles[sectionId];
                if (section.files.length > 0 && section.outputSection) {
                    const outputSectionKey = section.outputSection;
                    if (!processedTechnicalData[outputSectionKey])
                        processedTechnicalData[outputSectionKey] = {
                            files: [],
                        };

                    for (const fileObj of section.files) {
                        if (fileObj.isAttachment) {
                            processedTechnicalData[outputSectionKey].files.push(
                                {
                                    name: fileObj.file.name,
                                    type: fileObj.file.type,
                                    size: fileObj.file.size,
                                    description: fileObj.description,
                                    fileType: section.type,
                                    isAttachment: true,
                                    // For attachments, data might be handled differently or not sent as base64
                                }
                            );
                        } else {
                            const base64Data = await new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onload = (e) => resolve(e.target.result);
                                reader.readAsDataURL(fileObj.file);
                            });
                            processedTechnicalData[outputSectionKey].files.push(
                                {
                                    name: fileObj.file.name,
                                    type: fileObj.file.type,
                                    size: fileObj.file.size,
                                    data: base64Data,
                                    description: fileObj.description,
                                    fileType: section.type,
                                    ...(section.type === "csv" && {
                                        tableData: fileObj.previewData,
                                    }),
                                }
                            );
                        }
                    }
                }
            }

            const trimmedFormData = {};
            const overviewDataFields = isAdHocMode
                ? adHocOverviewFields
                : selectedTemplate?.overview || [];
            overviewDataFields.forEach((field) => {
                trimmedFormData[field.key] =
                    typeof formData[field.key] === "string"
                        ? formData[field.key].trim()
                        : formData[field.key];
            });

            const brdGenerationData = {
                templateName: isAdHocMode
                    ? "Ad-Hoc"
                    : selectedTemplate?.templateName,
                isAdHoc: isAdHocMode,
                formData: trimmedFormData,
                overviewFields: overviewDataFields,
                businessUseCase: businessUseCase.trim(),
                businessLogic: businessLogic.trim(),
                outputs: selectedOutputsList,
                technicalData: processedTechnicalData,
            };

            localStorage.setItem(
                "brd_generation_data",
                JSON.stringify(brdGenerationData)
            );
            navigate('/generate-brd?new=true');
        } catch (error) {
            console.error("Error preparing BRD data:", error);
            alert("Error preparing BRD data. Please try again.");
        }
    };

    const getAvailableOutputsToAdd = () => {
        const currentOutputIds = outputs.map((output) => output.id);
        return Object.keys(availableOutputs).filter(
            (key) => !currentOutputIds.includes(key)
        );
    };

    // Helper to get ad-hoc overview fields that are available to be added
    const getAvailableAdHocFieldsToAdd = () => {
        return Object.keys(availableInputsConfig).filter(
            (key) => !adHocOverviewFields.some((field) => field.key === key)
        );
    };

    const handleToggleSelectAllPendingOverviewFields = () => {
        const availableToAdd = getAvailableAdHocFieldsToAdd();
        if (
            pendingOverviewFields.size === availableToAdd.length &&
            availableToAdd.length > 0
        ) {
            setPendingOverviewFields(new Set()); // Unselect all
        } else {
            setPendingOverviewFields(new Set(availableToAdd)); // Select all available
        }
    };

    const renderInputField = (input) => {
        const { key, type } = input;

        if (typeof type === "object") {
            // Handle complex types like dropdowns
            if (type.type === "dropdown_single" && type.options) {
                return (
                    <div className="w-full">
                        <select
                            value={formData[key] || ""}
                            onChange={(e) =>
                                handleInputChange(key, e.target.value)
                            }
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="">Select an option</option>
                            {type.options.map((option, idx) => (
                                <option key={idx} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </div>
                );
            }
            if (type.type === "dropdown_multi" && type.options) {
                const selectedValues = Array.isArray(formData[key])
                    ? formData[key]
                    : [];
                return (
                    <div className="w-full">
                        {selectedValues.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1">
                                {selectedValues.map((value, idx) => (
                                    <span
                                        key={idx}
                                        className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800"
                                    >
                                        {value}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const newValues =
                                                    selectedValues.filter(
                                                        (v) => v !== value
                                                    );
                                                handleInputChange(
                                                    key,
                                                    newValues
                                                );
                                            }}
                                            className="ml-1 text-blue-600 hover:text-blue-800"
                                        >
                                            <XMarkIcon className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <select
                            value=""
                            onChange={(e) => {
                                if (
                                    e.target.value &&
                                    !selectedValues.includes(e.target.value)
                                ) {
                                    const newValues = [
                                        ...selectedValues,
                                        e.target.value,
                                    ];
                                    handleInputChange(key, newValues);
                                }
                            }}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="">
                                {selectedValues.length === 0
                                    ? "Select options..."
                                    : "Add more options..."}
                            </option>
                            {type.options
                                .filter(
                                    (option) => !selectedValues.includes(option)
                                )
                                .map((option, idx) => (
                                    <option key={idx} value={option}>
                                        {option}
                                    </option>
                                ))}
                        </select>
                        {selectedValues.length === 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                                Click the dropdown to select multiple options
                            </p>
                        )}
                    </div>
                );
            }
            return (
                <div className="w-full">
                    <input
                        type="text"
                        value={formData[key] || ""}
                        onChange={(e) => handleInputChange(key, e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder={`Input for ${key} (unknown object type)`}
                    />
                </div>
            );
        }

        if (typeof type === "string") {
            // Handle simple string types
            const commonClasses =
                "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500";
            switch (type) {
                case "input":
                    return (
                        <div className="w-full">
                            <input
                                type="text"
                                value={formData[key] || ""}
                                onChange={(e) =>
                                    handleInputChange(key, e.target.value)
                                }
                                className={commonClasses}
                            />
                        </div>
                    );
                case "textarea":
                    return (
                        <div className="w-full">
                            <textarea
                                value={formData[key] || ""}
                                onChange={(e) =>
                                    handleInputChange(key, e.target.value)
                                }
                                className={`${commonClasses} min-h-[80px]`}
                            />
                        </div>
                    );
                case "date":
                    return (
                        <div className="w-full">
                            <input
                                type="date"
                                value={formData[key] || ""}
                                onChange={(e) =>
                                    handleInputChange(key, e.target.value)
                                }
                                className={commonClasses}
                            />
                        </div>
                    );
                default:
                    return (
                        <div className="w-full">
                            <input
                                type="text"
                                value={formData[key] || ""}
                                onChange={(e) =>
                                    handleInputChange(key, e.target.value)
                                }
                                className={commonClasses}
                                placeholder={`Input for ${key} (unknown type: ${type})`}
                            />
                        </div>
                    );
            }
        }
        return (
            <div className="w-full">
                <p className="text-sm text-red-500">
                    Unsupported input type for field: {key}
                </p>
            </div>
        );
    };

    if (isLoading && !location.state?.error) {
        // Show loading only if not coming from an error redirect
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                <p className="ml-3 text-lg text-gray-700">
                    Loading BRD Builder...
                </p>
            </div>
        );
    }

    if (location.state?.error) {
        return (
            <div className="text-center py-10">
                <ExclamationTriangleIcon className="h-12 w-12 mx-auto text-red-500 mb-4" />
                <h2 className="text-xl font-semibold text-red-700 mb-2">
                    Error
                </h2>
                <p className="text-gray-600 mb-6">{location.state.error}</p>
                <button
                    onClick={() => navigate("/create-brd", { replace: true })}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                    Back to Selection
                </button>
            </div>
        );
    }

    // Main Render
    return (
        <div className="space-y-4 max-w-5xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">
                    {pageTitle}
                </h1>
                <button
                    onClick={() => navigate("/create-brd")}
                    className="text-sm text-blue-600 hover:text-blue-800"
                >
                    &larr; Back to Selection
                </button>
            </div>

            {/* Progress Bar & Navigation */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                <nav aria-label="Progress">
                    <ol
                        role="list"
                        className="flex items-center justify-between"
                    >
                        {SECTIONS.map((section, sectionIdx) => {
                            const isActive = activeSectionKey === section.key;
                            const isCompleted =
                                sectionIdx <
                                SECTIONS.findIndex(
                                    (s) => s.key === activeSectionKey
                                );
                            const isVisited = sectionIdx <= currentStepIndex;

                            // Determine if a step should be disabled for navigation
                            const businessFieldsValid =
                                businessUseCase.trim() && businessLogic.trim();
                            let isDisabled = false;
                            if (!isAdHocMode) {
                                // Original logic for template mode: Outputs step disabled if business invalid
                                const requiresBusinessValidation =
                                    sectionIdx >
                                    SECTIONS.findIndex(
                                        (s) => s.key === "business"
                                    );
                                isDisabled =
                                    requiresBusinessValidation &&
                                    !businessFieldsValid;
                            }
                            // For Ad-Hoc mode, isDisabled remains false, allowing free navigation.

                            let circleClass =
                                "bg-gray-300 group-hover:bg-gray-400";
                            let textClass = "text-gray-500";
                            let icon = (
                                <span className="h-5 w-5 text-white flex items-center justify-center font-semibold">
                                    {section.step}
                                </span>
                            );
                            let outgoingLineClass = "bg-gray-200";

                            if (isDisabled) {
                                circleClass = "bg-gray-200 cursor-not-allowed";
                                textClass = "text-gray-400";
                            } else if (isActive) {
                                circleClass = "bg-blue-600";
                                textClass = "text-blue-600 font-semibold";
                                icon = (
                                    <CheckCircleIcon
                                        className="h-5 w-5 text-white"
                                        aria-hidden="true"
                                    />
                                );
                                outgoingLineClass = "bg-blue-600";
                            } else if (isCompleted) {
                                circleClass =
                                    "bg-blue-500 group-hover:bg-blue-600";
                                textClass = "text-gray-700";
                                icon = (
                                    <CheckCircleIcon
                                        className="h-5 w-5 text-white"
                                        aria-hidden="true"
                                    />
                                );
                                outgoingLineClass = "bg-blue-600";
                            } else if (isVisited) {
                                circleClass =
                                    "bg-gray-400 group-hover:bg-gray-500";
                                textClass = "text-gray-600";
                            }

                            return (
                                <li
                                    key={section.key}
                                    className="group relative flex-1"
                                >
                                    <div className="relative z-10 bg-white flex flex-col items-center px-1 py-1">
                                        <button
                                            onClick={() =>
                                                !isDisabled &&
                                                handleSectionClick(section.key)
                                            }
                                            className={`relative flex h-8 w-8 items-center justify-center rounded-full ${circleClass} transition-colors duration-300 ease-in-out ${
                                                isDisabled
                                                    ? "cursor-not-allowed"
                                                    : "cursor-pointer"
                                            }`}
                                            aria-current={
                                                isActive ? "step" : undefined
                                            }
                                            disabled={isDisabled}
                                            title={
                                                isDisabled
                                                    ? "Complete Business Requirements first"
                                                    : ""
                                            }
                                        >
                                            {icon}
                                        </button>
                                        <p
                                            className={`mt-1.5 text-xs text-center font-medium ${textClass} transition-colors duration-300 ease-in-out w-20 truncate`}
                                        >
                                            {section.step}. {section.label}
                                        </p>
                                    </div>
                                    {sectionIdx < SECTIONS.length - 1 && (
                                        <div
                                            className={`absolute top-4 h-0.5 ${outgoingLineClass} transition-colors duration-300 ease-in-out`}
                                            style={{
                                                left: "50%",
                                                right: "-50%",
                                                zIndex: 0,
                                            }}
                                        />
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </nav>
            </div>

            {/* Section Content */}
            <div className="bg-white rounded-lg shadow-sm p-4 md:p-6">
                {activeSectionKey === "overview" && (
                    <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">
                            {isAdHocMode
                                ? "Overview (Ad-Hoc)"
                                : selectedTemplate?.templateName
                                ? `${selectedTemplate.templateName} - Overview`
                                : "Overview"}
                        </h3>
                        <div className="space-y-4">
                            {isAdHocMode && (
                                <>
                                    <div className="my-4">
                                        <button
                                            onClick={() => {
                                                setPendingOverviewFields(
                                                    new Set()
                                                ); // Clear previous selections when opening
                                                setShowAddFieldPanel(true);
                                            }}
                                            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 flex items-center"
                                        >
                                            <PlusIcon className="h-5 w-5 mr-2" />{" "}
                                            Add Fields from Library
                                        </button>
                                    </div>
                                    {showAddFieldPanel && (
                                        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-start pt-10 sm:pt-20 px-4">
                                            <div className="bg-white p-5 rounded-lg shadow-xl w-full max-w-lg transform transition-all duration-300 ease-out">
                                                <div className="flex justify-between items-center mb-4 pb-3 border-b">
                                                    <h4 className="text-lg font-semibold text-gray-800">
                                                        Select Fields to Add
                                                    </h4>
                                                    <button
                                                        onClick={() => {
                                                            setShowAddFieldPanel(
                                                                false
                                                            );
                                                            setPendingOverviewFields(
                                                                new Set()
                                                            );
                                                        }}
                                                        className="text-gray-400 hover:text-gray-600"
                                                    >
                                                        <XMarkIcon className="h-6 w-6" />
                                                    </button>
                                                </div>

                                                {/* Select/Unselect All Checkbox for Ad-Hoc Overview Fields */}
                                                {Object.keys(
                                                    availableInputsConfig
                                                ).length > 0 && (
                                                    <div className="px-1 py-2 border-b border-gray-200 mb-2">
                                                        <label className="flex items-center space-x-3 cursor-pointer w-full hover:bg-gray-50 p-1.5 rounded-md">
                                                            <input
                                                                type="checkbox"
                                                                className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 transition duration-150 ease-in-out"
                                                                checked={
                                                                    getAvailableAdHocFieldsToAdd()
                                                                        .length >
                                                                        0 &&
                                                                    pendingOverviewFields.size ===
                                                                        getAvailableAdHocFieldsToAdd()
                                                                            .length
                                                                }
                                                                onChange={
                                                                    handleToggleSelectAllPendingOverviewFields
                                                                }
                                                                disabled={
                                                                    getAvailableAdHocFieldsToAdd()
                                                                        .length ===
                                                                    0
                                                                }
                                                            />
                                                            <span className="text-sm font-medium text-gray-700">
                                                                {getAvailableAdHocFieldsToAdd()
                                                                    .length >
                                                                    0 &&
                                                                pendingOverviewFields.size ===
                                                                    getAvailableAdHocFieldsToAdd()
                                                                        .length
                                                                    ? "Unselect All"
                                                                    : "Select All"}
                                                                <span className="text-gray-500 font-normal ml-1">
                                                                    (
                                                                    {
                                                                        getAvailableAdHocFieldsToAdd()
                                                                            .length
                                                                    }{" "}
                                                                    available to
                                                                    add)
                                                                </span>
                                                            </span>
                                                        </label>
                                                    </div>
                                                )}

                                                <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
                                                    {Object.keys(
                                                        availableInputsConfig
                                                    ).map((inputKey) => {
                                                        const fieldConfig =
                                                            availableInputsConfig[
                                                                inputKey
                                                            ];
                                                        const isAdded =
                                                            adHocOverviewFields.some(
                                                                (f) =>
                                                                    f.key ===
                                                                    inputKey
                                                            );
                                                        const isSelected =
                                                            pendingOverviewFields.has(
                                                                inputKey
                                                            );
                                                        return (
                                                            <div
                                                                key={inputKey}
                                                                onClick={() =>
                                                                    !isAdded &&
                                                                    togglePendingOverviewField(
                                                                        inputKey
                                                                    )
                                                                }
                                                                className={`p-3 border rounded-md flex justify-between items-center transition-all duration-150 ease-in-out ${
                                                                    isAdded
                                                                        ? "bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed opacity-70"
                                                                        : isSelected
                                                                        ? "bg-blue-100 border-blue-400 ring-2 ring-blue-300 cursor-pointer"
                                                                        : "bg-white border-gray-300 hover:bg-blue-50 hover:border-blue-300 cursor-pointer"
                                                                }`}
                                                            >
                                                                <div className="flex items-center">
                                                                    {!isAdded && (
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={
                                                                                isSelected
                                                                            }
                                                                            readOnly // Click is handled by the div
                                                                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-3 cursor-pointer"
                                                                        />
                                                                    )}
                                                                    <span
                                                                        className={`font-medium ${
                                                                            isAdded
                                                                                ? ""
                                                                                : "text-gray-700"
                                                                        }`}
                                                                    >
                                                                        {
                                                                            inputKey
                                                                        }
                                                                    </span>
                                                                    <span className="text-xs ml-2 text-gray-500">
                                                                        (
                                                                        {typeof fieldConfig ===
                                                                        "string"
                                                                            ? fieldConfig
                                                                            : fieldConfig.type}
                                                                        )
                                                                    </span>
                                                                </div>
                                                                {isAdded && (
                                                                    <CheckCircleIcon
                                                                        className="h-5 w-5 text-green-500"
                                                                        title="Already added"
                                                                    />
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    {Object.keys(
                                                        availableInputsConfig
                                                    ).length === 0 && (
                                                        <p className="text-sm text-gray-500 italic py-4 text-center">
                                                            No global input
                                                            fields configured in
                                                            settings.
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="mt-5 pt-4 border-t flex justify-end">
                                                    <button
                                                        onClick={
                                                            applyPendingOverviewFields
                                                        }
                                                        disabled={
                                                            pendingOverviewFields.size ===
                                                            0
                                                        }
                                                        className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
                                                    >
                                                        <ListBulletIcon className="h-5 w-5 mr-2" />{" "}
                                                        Add Selected (
                                                        {
                                                            pendingOverviewFields.size
                                                        }
                                                        ) Fields
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {adHocOverviewFields.length > 0 && (
                                        <DragDropContext
                                            onDragEnd={handleAdHocFieldDragEnd}
                                        >
                                            <Droppable droppableId="adHocOverviewFieldsDroppable">
                                                {(provided) => (
                                                    <div
                                                        {...provided.droppableProps}
                                                        ref={provided.innerRef}
                                                        className="space-y-3 mt-4"
                                                    >
                                                        {adHocOverviewFields.map(
                                                            (field, index) => (
                                                                <Draggable
                                                                    key={
                                                                        field.key
                                                                    }
                                                                    draggableId={
                                                                        field.key
                                                                    }
                                                                    index={
                                                                        index
                                                                    }
                                                                >
                                                                    {(
                                                                        providedDraggable
                                                                    ) => (
                                                                        <div
                                                                            ref={
                                                                                providedDraggable.innerRef
                                                                            }
                                                                            {...providedDraggable.draggableProps}
                                                                            className="flex items-center space-x-3 py-2.5 px-3 bg-gray-50 rounded-md border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-150 ease-in-out"
                                                                        >
                                                                            <div
                                                                                {...providedDraggable.dragHandleProps}
                                                                                className="cursor-move text-gray-400 hover:text-gray-700 p-1"
                                                                            >
                                                                                <ChevronUpDownIcon className="h-5 w-5" />
                                                                            </div>
                                                                            <label
                                                                                htmlFor={`adhoc-field-${field.key}`}
                                                                                className="w-48 sm:w-56 md:w-64 text-sm font-medium text-gray-700 truncate pr-2 shrink-0"
                                                                            >
                                                                                {
                                                                                    field.label
                                                                                }
                                                                            </label>
                                                                            <div className="flex-grow min-w-0">
                                                                                {renderInputField(
                                                                                    {
                                                                                        ...field,
                                                                                        id: `adhoc-field-${field.key}`,
                                                                                    }
                                                                                )}
                                                                            </div>
                                                                            <button
                                                                                onClick={() =>
                                                                                    handleRemoveAdHocField(
                                                                                        field.key
                                                                                    )
                                                                                }
                                                                                className="text-red-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-500/10 transition-colors"
                                                                                title="Remove field"
                                                                            >
                                                                                <TrashIcon className="h-4 w-4" />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </Draggable>
                                                            )
                                                        )}
                                                        {provided.placeholder}
                                                    </div>
                                                )}
                                            </Droppable>
                                        </DragDropContext>
                                    )}
                                    {adHocOverviewFields.length === 0 &&
                                        !showAddFieldPanel && (
                                            <p className="text-sm text-gray-500 italic">
                                                No fields added yet. Click "+
                                                Add Field" to start.
                                            </p>
                                        )}
                                </>
                            )}
                            {!isAdHocMode &&
                                selectedTemplate &&
                                selectedTemplate.overview.map(
                                    (input, index) => (
                                        <div
                                            key={input.key || index}
                                            className={`grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 items-center py-2 ${
                                                index <
                                                selectedTemplate.overview
                                                    .length -
                                                    1
                                                    ? "border-b border-gray-100"
                                                    : ""
                                            }`}
                                        >
                                            <div className="flex items-center md:col-span-1">
                                                <label className="text-gray-700 text-sm font-medium">
                                                    {input.label}
                                                </label>
                                            </div>
                                            <div className="md:col-span-3">
                                                {renderInputField(input)}
                                            </div>
                                        </div>
                                    )
                                )}
                            {!isAdHocMode &&
                                selectedTemplate &&
                                selectedTemplate.overview.length === 0 && (
                                    <p className="text-sm text-gray-500 italic">
                                        No overview fields configured in this
                                        template.
                                    </p>
                                )}
                        </div>
                    </div>
                )}

                {activeSectionKey === "technical" && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-gray-800">
                                Technical Attachments
                            </h3>
                            <div className="flex space-x-2">
                                <button
                                    onClick={() => addTechnicalSection("csv")}
                                    className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
                                    title="Add CSV upload section"
                                >
                                    <PlusIcon className="h-4 w-4 mr-1" /> Add
                                    CSV Section
                                </button>
                                <button
                                    onClick={() => addTechnicalSection("image")}
                                    className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center"
                                    title="Add Image upload section"
                                >
                                    <PlusIcon className="h-4 w-4 mr-1" /> Add
                                    Image Section
                                </button>
                            </div>
                        </div>
                        {Object.entries(technicalFiles).map(
                            ([sectionId, section]) => (
                                <div
                                    key={sectionId}
                                    className={`border rounded-lg p-4 ${
                                        section.type === "csv"
                                            ? "bg-green-50 border-green-200"
                                            : "bg-purple-50 border-purple-200"
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center">
                                            {section.type === "csv" ? (
                                                <TableCellsIcon className="h-5 w-5 text-green-600 mr-2" />
                                            ) : (
                                                <PhotoIcon className="h-5 w-5 text-purple-600 mr-2" />
                                            )}
                                            <h4 className="text-sm font-semibold text-gray-800">
                                                {section.type === "csv"
                                                    ? "CSV / Excel Files Upload"
                                                    : "Image Files Upload"}
                                            </h4>
                                        </div>
                                        <button
                                            onClick={() =>
                                                removeTechnicalSection(
                                                    sectionId
                                                )
                                            }
                                            className="text-red-500 hover:text-red-700 p-1"
                                            title="Remove this upload section"
                                        >
                                            <XMarkIcon className="h-5 w-5" />
                                        </button>
                                    </div>
                                    <div className="mb-4">
                                        <label
                                            htmlFor={`${sectionId}-output-section`}
                                            className="block text-sm font-medium text-gray-700 mb-1"
                                        >
                                            Select Output Section for{" "}
                                            {section.type === "csv"
                                                ? "CSV"
                                                : "Image"}{" "}
                                            Files:
                                        </label>
                                        <select
                                            id={`${sectionId}-output-section`}
                                            value={section.outputSection}
                                            onChange={(e) =>
                                                handleOutputSectionChange(
                                                    sectionId,
                                                    e.target.value
                                                )
                                            }
                                            className="w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                            disabled={outputs.length === 0}
                                        >
                                            <option value="">
                                                Select output section...
                                            </option>
                                            {outputs.map((output) => (
                                                <option
                                                    key={output.id}
                                                    value={output.id}
                                                >
                                                    {output.name}
                                                </option>
                                            ))}
                                        </select>
                                        {outputs.length === 0 && (
                                            <p className="text-xs text-red-500 mt-1">
                                                Please define Output Sections
                                                first in the 'Outputs' tab.
                                            </p>
                                        )}
                                    </div>
                                    {section.outputSection && (
                                        <>
                                            <div className="mb-4">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Upload{" "}
                                                    {section.type === "csv"
                                                        ? "CSV"
                                                        : "Image"}{" "}
                                                    Files
                                                </label>
                                                <input
                                                    type="file"
                                                    accept={
                                                        section.type === "csv"
                                                            ? ".csv"
                                                            : "image/*"
                                                    }
                                                    multiple
                                                    onChange={(e) =>
                                                        handleFileUpload(
                                                            sectionId,
                                                            e
                                                        )
                                                    }
                                                    className={`block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold ${
                                                        section.type === "csv"
                                                            ? "file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                                                            : "file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                                                    }`}
                                                />
                                            </div>
                                            {section.files.length > 0 && (
                                                <div>
                                                    <h5 className="text-sm font-medium text-gray-700 mb-2">
                                                        Uploaded{" "}
                                                        {section.type === "csv"
                                                            ? "CSV"
                                                            : "Image"}{" "}
                                                        Files for:{" "}
                                                        <span
                                                            className={`font-bold ml-1 ${
                                                                section.type ===
                                                                "csv"
                                                                    ? "text-green-700"
                                                                    : "text-purple-700"
                                                            }`}
                                                        >
                                                            {outputs.find(
                                                                (o) =>
                                                                    o.id ===
                                                                    section.outputSection
                                                            )?.name ||
                                                                section.outputSection}
                                                        </span>
                                                    </h5>
                                                    <div className="space-y-3">
                                                        {section.files.map(
                                                            (fileObj) => (
                                                                <div
                                                                    key={
                                                                        fileObj.id
                                                                    }
                                                                    className="p-3 border rounded-md bg-white"
                                                                >
                                                                    <div className="flex items-start justify-between mb-2">
                                                                        <div>
                                                                            <p className="text-sm font-medium text-gray-800 flex items-center">
                                                                                {fileObj.isAttachment ? (
                                                                                    <DocumentTextIcon
                                                                                        className="h-4 w-4 mr-2 text-gray-600"
                                                                                        title="Attachment"
                                                                                    />
                                                                                ) : section.type ===
                                                                                  "csv" ? (
                                                                                    <TableCellsIcon className="h-4 w-4 mr-2 text-green-600" />
                                                                                ) : (
                                                                                    <PhotoIcon className="h-4 w-4 mr-2 text-purple-600" />
                                                                                )}
                                                                                {
                                                                                    fileObj
                                                                                        .file
                                                                                        .name
                                                                                }{" "}
                                                                                <span className="text-xs text-gray-500 ml-2">
                                                                                    (
                                                                                    {(
                                                                                        fileObj
                                                                                            .file
                                                                                            .size /
                                                                                        1024
                                                                                    ).toFixed(
                                                                                        2
                                                                                    )}{" "}
                                                                                    KB){" "}
                                                                                    {fileObj.isAttachment &&
                                                                                        "(Attachment)"}
                                                                                </span>
                                                                            </p>
                                                                        </div>
                                                                        <button
                                                                            onClick={() =>
                                                                                handleRemoveFile(
                                                                                    sectionId,
                                                                                    fileObj.id
                                                                                )
                                                                            }
                                                                            className="text-red-500 hover:text-red-700 p-1"
                                                                            title="Remove file"
                                                                        >
                                                                            <TrashIcon className="h-4 w-4" />
                                                                        </button>
                                                                    </div>
                                                                    <div className="mb-2">
                                                                        <label
                                                                            htmlFor={`${sectionId}-desc-${fileObj.id}`}
                                                                            className="block text-xs font-medium text-gray-600 mb-1"
                                                                        >
                                                                            Description:
                                                                        </label>
                                                                        <input
                                                                            type="text"
                                                                            id={`${sectionId}-desc-${fileObj.id}`}
                                                                            value={
                                                                                fileObj.description
                                                                            }
                                                                            onChange={(
                                                                                e
                                                                            ) =>
                                                                                handleFileDescriptionChange(
                                                                                    sectionId,
                                                                                    fileObj.id,
                                                                                    e
                                                                                        .target
                                                                                        .value
                                                                                )
                                                                            }
                                                                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                                            placeholder={`Enter a brief description...`}
                                                                        />
                                                                    </div>
                                                                    {!fileObj.isAttachment &&
                                                                        fileObj.previewData &&
                                                                        section.type ===
                                                                            "csv" &&
                                                                        fileObj
                                                                            .previewData
                                                                            .rows &&
                                                                        fileObj
                                                                            .previewData
                                                                            .rows
                                                                            .length >
                                                                            0 && (
                                                                            <div className="p-2 border rounded bg-gray-50 max-h-48 overflow-auto">
                                                                                <p className="text-xs font-medium text-gray-600 mb-2">
                                                                                    Preview:
                                                                                </p>
                                                                                <table className="min-w-full divide-y divide-gray-200 text-xs">
                                                                                    <thead className="bg-gray-100">
                                                                                        <tr>
                                                                                            {fileObj.previewData.headers.map(
                                                                                                (
                                                                                                    header,
                                                                                                    hIdx
                                                                                                ) => (
                                                                                                    <th
                                                                                                        key={
                                                                                                            hIdx
                                                                                                        }
                                                                                                        scope="col"
                                                                                                        className="px-2 py-1 text-left font-medium text-gray-600 uppercase tracking-wider"
                                                                                                    >
                                                                                                        {
                                                                                                            header
                                                                                                        }
                                                                                                    </th>
                                                                                                )
                                                                                            )}
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                                                        {fileObj.previewData.rows
                                                                                            .slice(
                                                                                                0,
                                                                                                5
                                                                                            )
                                                                                            .map(
                                                                                                (
                                                                                                    row,
                                                                                                    rIdx
                                                                                                ) => (
                                                                                                    <tr
                                                                                                        key={
                                                                                                            rIdx
                                                                                                        }
                                                                                                    >
                                                                                                        {fileObj.previewData.headers.map(
                                                                                                            (
                                                                                                                header,
                                                                                                                cIdx
                                                                                                            ) => (
                                                                                                                <td
                                                                                                                    key={
                                                                                                                        cIdx
                                                                                                                    }
                                                                                                                    className="px-2 py-1 whitespace-nowrap text-gray-700"
                                                                                                                >
                                                                                                                    {
                                                                                                                        row[
                                                                                                                            header
                                                                                                                        ]
                                                                                                                    }
                                                                                                                </td>
                                                                                                            )
                                                                                                        )}
                                                                                                    </tr>
                                                                                                )
                                                                                            )}
                                                                                    </tbody>
                                                                                </table>
                                                                                {fileObj
                                                                                    .previewData
                                                                                    .rows
                                                                                    .length >
                                                                                    5 && (
                                                                                    <p className="text-xs text-gray-500 mt-1">
                                                                                        Showing
                                                                                        first
                                                                                        5
                                                                                        of{" "}
                                                                                        {
                                                                                            fileObj
                                                                                                .previewData
                                                                                                .rows
                                                                                                .length
                                                                                        }{" "}
                                                                                        total
                                                                                        rows
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    {!fileObj.isAttachment &&
                                                                        fileObj.previewData &&
                                                                        section.type ===
                                                                            "image" && (
                                                                            <div className="p-2 border rounded bg-gray-50">
                                                                                <p className="text-xs font-medium text-gray-600 mb-2">
                                                                                    Preview:
                                                                                </p>
                                                                                <img
                                                                                    src={
                                                                                        fileObj.previewData
                                                                                    }
                                                                                    alt="Preview"
                                                                                    className="max-w-full max-h-48 h-auto rounded border"
                                                                                />
                                                                            </div>
                                                                        )}
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )
                        )}
                        {Object.keys(technicalFiles).length === 0 && (
                            <div className="bg-gray-50 p-4 rounded-md text-center">
                                <p className="text-sm text-gray-500">
                                    No technical sections added.
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                    Click buttons above to add CSV or Image
                                    upload areas.
                                </p>
                            </div>
                        )}
                        {Object.keys(technicalFiles).length > 0 &&
                            Object.values(technicalFiles).every(
                                (s) => s.files.length === 0
                            ) && (
                                <div className="bg-gray-50 p-4 rounded-md text-center mt-4">
                                    <p className="text-sm text-gray-500">
                                        No files uploaded yet for the added
                                        technical sections.
                                    </p>
                                </div>
                            )}
                    </div>
                )}

                {activeSectionKey === "business" && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-800 mb-3">
                            Business Requirements
                        </h3>
                        <div>
                            <label
                                htmlFor="business-use-case"
                                className="block text-sm font-medium text-gray-700"
                            >
                                Business Use Case *
                            </label>
                            <textarea
                                id="business-use-case"
                                value={businessUseCase}
                                onChange={(e) =>
                                    handleBusinessInputChange(
                                        "businessUseCase",
                                        e.target.value
                                    )
                                }
                                className={`w-full mt-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 min-h-[100px] ${
                                    businessFormErrors.useCase
                                        ? "border-red-500 focus:ring-red-500"
                                        : "border-gray-300 focus:ring-blue-500"
                                }`}
                                placeholder="Describe the business problem or opportunity..."
                                required
                            />
                            {businessFormErrors.useCase && (
                                <p className="text-xs text-red-500 mt-1">
                                    {businessFormErrors.useCase}
                                </p>
                            )}
                        </div>
                        <div>
                            <label
                                htmlFor="business-logic"
                                className="block text-sm font-medium text-gray-700"
                            >
                                Business Logic / Rules *
                            </label>
                            <textarea
                                id="business-logic"
                                value={businessLogic}
                                onChange={(e) =>
                                    handleBusinessInputChange(
                                        "businessLogic",
                                        e.target.value
                                    )
                                }
                                className={`w-full mt-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 min-h-[120px] ${
                                    businessFormErrors.logic
                                        ? "border-red-500 focus:ring-red-500"
                                        : "border-gray-300 focus:ring-blue-500"
                                }`}
                                placeholder="Detail the specific rules, calculations, or processes..."
                                required
                            />
                            {businessFormErrors.logic && (
                                <p className="text-xs text-red-500 mt-1">
                                    {businessFormErrors.logic}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {activeSectionKey === "outputs" && (
                    <div className="space-y-3">
                        <div className="flex justify-between items-center mb-4 pb-3 border-b">
                            <h3 className="text-lg font-semibold text-gray-800">
                                Define Output Sections
                            </h3>
                            <div className="relative">
                                <button
                                    ref={addOutputButtonRef}
                                    id="add-output-section-button"
                                    onClick={() => {
                                        setIsOutputDropdownOpen(
                                            (prev) => !prev
                                        );
                                    }}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 flex items-center disabled:bg-gray-300"
                                    disabled={
                                        getAvailableOutputsToAdd().length ===
                                            0 && !isOutputDropdownOpen
                                    }
                                >
                                    <PlusIcon className="h-5 w-5 mr-1.5" />{" "}
                                    {isOutputDropdownOpen
                                        ? "Close Panel"
                                        : "Add Output Sections"}
                                </button>

                                {isOutputDropdownOpen && (
                                    <div
                                        ref={dropdownRef}
                                        id="output-multiselect-panel"
                                        className="absolute right-0 mt-2 w-72 bg-white shadow-xl rounded-lg border z-20 py-2 transform transition-all duration-150 ease-out origin-top-right"
                                    >
                                        <div className="px-4 py-2 border-b border-gray-200">
                                            <label className="flex items-center space-x-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 transition duration-150 ease-in-out"
                                                    checked={
                                                        getAvailableOutputsToAdd()
                                                            .length > 0 &&
                                                        pendingOutputSections.size ===
                                                            getAvailableOutputsToAdd()
                                                                .length
                                                    }
                                                    onChange={
                                                        handleToggleSelectAllPendingOutputSections
                                                    }
                                                    disabled={
                                                        getAvailableOutputsToAdd()
                                                            .length === 0
                                                    }
                                                />
                                                <span className="text-xs font-medium text-gray-700">
                                                    {getAvailableOutputsToAdd()
                                                        .length > 0 &&
                                                    pendingOutputSections.size ===
                                                        getAvailableOutputsToAdd()
                                                            .length
                                                        ? "Unselect All"
                                                        : "Select All"}
                                                    <span className="text-gray-500 font-normal ml-1">
                                                        (
                                                        {
                                                            getAvailableOutputsToAdd()
                                                                .length
                                                        }{" "}
                                                        available)
                                                    </span>
                                                </span>
                                            </label>
                                        </div>
                                        <div className="max-h-60 overflow-y-auto">
                                            {getAvailableOutputsToAdd().map(
                                                (key) => (
                                                    <label
                                                        key={key}
                                                        className="flex items-center space-x-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 transition duration-150 ease-in-out"
                                                            checked={pendingOutputSections.has(
                                                                key
                                                            )}
                                                            onChange={() =>
                                                                togglePendingOutputSection(
                                                                    key
                                                                )
                                                            }
                                                        />
                                                        <span className="text-sm text-gray-700">
                                                            {key}
                                                        </span>
                                                    </label>
                                                )
                                            )}
                                            {getAvailableOutputsToAdd()
                                                .length === 0 && (
                                                <p className="px-4 py-3 text-xs text-gray-500 text-center italic">
                                                    All available sections have
                                                    been added.
                                                </p>
                                            )}
                                        </div>
                                        {getAvailableOutputsToAdd().length >
                                            0 && (
                                            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 sticky bottom-0">
                                                <button
                                                    onClick={
                                                        applyPendingOutputSections
                                                    }
                                                    disabled={
                                                        pendingOutputSections.size ===
                                                        0
                                                    }
                                                    className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-3 rounded-md shadow-sm flex items-center justify-center transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                                >
                                                    <ListBulletIcon className="h-5 w-5 mr-1.5" />{" "}
                                                    Add Selected (
                                                    {pendingOutputSections.size}
                                                    )
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        {outputs.length > 0 ? (
                            <DragDropContext onDragEnd={handleDragEnd}>
                                <Droppable droppableId="outputsDroppable">
                                    {(provided) => (
                                        <div
                                            {...provided.droppableProps}
                                            ref={provided.innerRef}
                                            className="space-y-2"
                                        >
                                            {outputs.map((output, index) => (
                                                <Draggable
                                                    key={output.id}
                                                    draggableId={output.id}
                                                    index={index}
                                                >
                                                    {(
                                                        providedDraggable,
                                                        snapshot
                                                    ) => (
                                                        <div
                                                            ref={
                                                                providedDraggable.innerRef
                                                            }
                                                            {...providedDraggable.draggableProps}
                                                            className={`p-3 rounded-md border flex items-center justify-between transition-shadow ${
                                                                snapshot.isDragging
                                                                    ? "shadow-lg bg-blue-50"
                                                                    : "bg-white"
                                                            } ${
                                                                movingOutput ===
                                                                output.id
                                                                    ? "ring-2 ring-yellow-400"
                                                                    : "border-gray-200"
                                                            }`}
                                                            data-output-id={
                                                                output.id
                                                            }
                                                            onKeyDown={(e) =>
                                                                handleOutputMoveKeyDown(
                                                                    e,
                                                                    output.id
                                                                )
                                                            }
                                                            tabIndex={
                                                                movingOutput ===
                                                                output.id
                                                                    ? 0
                                                                    : -1
                                                            }
                                                        >
                                                            <div className="flex items-center">
                                                                <button
                                                                    {...providedDraggable.dragHandleProps}
                                                                    onClick={() =>
                                                                        setMovingOutput(
                                                                            movingOutput ===
                                                                                output.id
                                                                                ? null
                                                                                : output.id
                                                                        )
                                                                    }
                                                                    className="text-gray-400 hover:text-gray-600 p-1 mr-2 cursor-grab active:cursor-grabbing"
                                                                    title="Reorder section"
                                                                >
                                                                    <ChevronUpDownIcon className="h-5 w-5" />
                                                                </button>
                                                                <span className="text-sm font-medium text-gray-800">
                                                                    {
                                                                        output.name
                                                                    }
                                                                </span>
                                                                <div className="ml-3 flex gap-1.5">
                                                                    {(
                                                                        output.types ||
                                                                        []
                                                                    ).includes(
                                                                        "image"
                                                                    ) && (
                                                                        <PhotoIcon
                                                                            className="h-4 w-4 text-purple-500"
                                                                            title="Image Output"
                                                                        />
                                                                    )}
                                                                    {(
                                                                        output.types ||
                                                                        []
                                                                    ).includes(
                                                                        "table"
                                                                    ) && (
                                                                        <TableCellsIcon
                                                                            className="h-4 w-4 text-green-500"
                                                                            title="Table Output"
                                                                        />
                                                                    )}
                                                                    {(
                                                                        output.types ||
                                                                        []
                                                                    ).includes(
                                                                        "content"
                                                                    ) && (
                                                                        <DocumentTextIcon
                                                                            className="h-4 w-4 text-blue-500"
                                                                            title="Content Output"
                                                                        />
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() =>
                                                                    removeOutput(
                                                                        output.id
                                                                    )
                                                                }
                                                                className="text-red-500 hover:text-red-700 p-1"
                                                                title="Remove section"
                                                            >
                                                                <XMarkIcon className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>
                            </DragDropContext>
                        ) : (
                            <p className="text-sm text-gray-500 italic">
                                No output sections selected. Add sections to
                                include them in the BRD.
                            </p>
                        )}
                    </div>
                )}

                {/* Next/Previous Buttons */}
                <div className="mt-8 flex justify-between items-center border-t pt-6">
                    <button
                        onClick={() => {
                            const currentSectionIndex = SECTIONS.findIndex(
                                (s) => s.key === activeSectionKey
                            );
                            if (currentSectionIndex > 0)
                                setActiveSectionKey(
                                    SECTIONS[currentSectionIndex - 1].key
                                );
                        }}
                        disabled={activeSectionKey === SECTIONS[0].key}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                        Previous
                    </button>
                    {activeSectionKey !== SECTIONS[SECTIONS.length - 1].key ? (
                        <button
                            onClick={handleNextClick}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 flex items-center"
                        >
                            Next <ArrowRightIcon className="h-4 w-4 ml-1.5" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 flex items-center"
                        >
                            Generate BRD{" "}
                            <DocumentTextIcon className="h-4 w-4 ml-1.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Ad-Hoc CSV/Excel Upload Choice Modal - Placed at the end of the main return for stacking context */}
            {csvUploadChoice.showPrompt && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-60 overflow-y-auto h-full w-full z-[100] flex justify-center items-center p-4 backdrop-blur-sm">
                    <div className="bg-white p-5 rounded-xl shadow-2xl w-full max-w-md relative transform transition-all duration-300 ease-out scale-100">
                        <button
                            onClick={() =>
                                csvUploadChoice.resolvePromise("cancel")
                            }
                            className="absolute top-3.5 right-3.5 text-gray-400 hover:text-gray-700 transition-colors"
                            aria-label="Close"
                        >
                            <XMarkIcon className="h-5 w-5" />
                        </button>
                        <div className="flex items-center mb-4">
                            <TableCellsIcon className="h-7 w-7 text-blue-500 mr-3 shrink-0" />
                            <div>
                                <h4 className="text-lg font-semibold text-gray-800">
                                    CSV/Excel Upload
                                </h4>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    For file:{" "}
                                    <span className="font-medium text-gray-700 truncate max-w-xs inline-block align-bottom">
                                        {csvUploadChoice.file?.name}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <p className="text-sm text-gray-600 mb-5">
                            How would you like to incorporate this file into
                            your BRD?
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                onClick={() =>
                                    csvUploadChoice.resolvePromise("attachment")
                                }
                                className="w-full px-4 py-2.5 text-sm font-medium text-center text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 border border-blue-200 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                            >
                                Attach as File
                            </button>
                            <button
                                onClick={() =>
                                    csvUploadChoice.resolvePromise("content")
                                }
                                className="w-full px-4 py-2.5 text-sm font-medium text-center text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                            >
                                Embed as Table
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CreateBRDEditorPage;
