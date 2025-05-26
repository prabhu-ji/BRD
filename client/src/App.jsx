import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";

const HomePage = lazy(() => import("./pages/HomePage.jsx"));
const TemplateBuilder = lazy(() => import("./pages/TemplateBuilder.jsx"));
const CreateBRD = lazy(() => import("./pages/CreateBRD.jsx"));
const GenerateBRD = lazy(() => import("./pages/GenerateBRD.jsx"));

// Loading fallback
const Loading = () => (
    <div className="flex items-center justify-center h-64">
        <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            <p className="mt-4 text-gray-700">Loading...</p>
        </div>
    </div>
);

function App() {
    return (
        <div className="min-h-screen bg-gray-50">
            <Navbar />
            <div className="container mx-auto px-4 py-6 max-w-5xl">
                <Suspense fallback={<Loading />}>
                    <Routes>
                        <Route path="/config" element={<HomePage />} />
                        <Route
                            path="/template-builder"
                            element={<TemplateBuilder />}
                        />
                        <Route path="/create-brd" element={<CreateBRD />} />
                        <Route path="/generate-brd" element={<GenerateBRD />} />
                        <Route
                            path="/"
                            element={<Navigate to="/create-brd" replace />}
                        />
                    </Routes>
                </Suspense>
            </div>
        </div>
    );
}

export default App;
