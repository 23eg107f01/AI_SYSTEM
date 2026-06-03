import { useState, ChangeEvent, DragEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import Navbar from "../components/Navbar";
import { AuthUser } from "../utils/auth";
import api from "../utils/api";

interface Props {
  user: AuthUser;
}

interface KBDocument {
  id: number;
  filename: string;
  category: string | null;
  status: string; // pending | processing | ready | error
  uploaded_at: string;
}

const statusColors: Record<string, string> = {
  ready: "bg-green-50 text-green-700 border-green-200",
  done: "bg-green-50 text-green-700 border-green-200",
  processing: "bg-amber-50 text-amber-700 border-amber-200",
  pending: "bg-slate-50 text-slate-600 border-slate-200",
  error: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

const statusLabels: Record<string, string> = {
  ready: "Done ✓",
  done: "Done ✓",
  processing: "Processing...",
  pending: "Pending",
  error: "Failed ✗",
  failed: "Failed ✗",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export default function AdminPanel({ user }: Props) {
  const qc = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState("General");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Poll database list more frequently if there are files in 'processing' status
  const { data: docs = [], isLoading } = useQuery<KBDocument[]>(
    "kb-docs",
    () => api.get("/api/kb").then((r) => r.data),
    {
      refetchInterval: (data) => {
        const hasProcessing = data?.some((doc) => doc.status === "processing" || doc.status === "pending");
        return hasProcessing ? 3000 : 15000;
      },
    }
  );

  const deleteMutation = useMutation(
    (docId: number) => api.delete(`/api/kb/${docId}`),
    {
      onSuccess: () => {
        qc.invalidateQueries("kb-docs");
      },
    }
  );

  function validateAndSetFile(file: File | null) {
    setUploadMsg(null);
    setUploadError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    const allowed = [".pdf", ".docx", ".doc", ".txt"];
    
    if (!allowed.includes(ext)) {
      setUploadError(`Unsupported file format "${ext}". Allowed: PDF, DOCX, TXT.`);
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadError("File size exceeds the 10 MB limit.");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    validateAndSetFile(file);
  }

  // Drag and drop handlers
  function handleDrag(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  }

  async function handleUpload() {
    if (!selectedFile || uploadLoading) return;
    setUploadLoading(true);
    setUploadMsg(null);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("category", category);

    try {
      const { data } = await api.post("/admin/upload-kb", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadMsg(`✓ "${data.filename}" uploaded successfully. Ingestion scheduled in background.`);
      setSelectedFile(null);
      qc.invalidateQueries("kb-docs");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Upload failed. Please try again.";
      setUploadError(msg);
    } finally {
      setUploadLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar user={user} />
      
      <main className="flex-1 px-6 py-10 max-w-4xl w-full mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Admin Knowledge Base</h1>
          <p className="text-sm text-slate-500 mt-1">
            Feed, update, and manage documents to train the RAG AI search client.
          </p>
        </div>

        {/* Upload panel with visual drag and drop zone */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 mb-8">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Ingest New Document</h2>
          
          <div className="space-y-6">
            {/* Drag & Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-all ${
                dragActive
                  ? "border-blue-500 bg-blue-50/50"
                  : selectedFile
                  ? "border-green-300 bg-green-50/10"
                  : "border-slate-200 hover:border-slate-300 bg-slate-50/30"
              }`}
            >
              <input
                type="file"
                id="file-upload-input"
                accept=".pdf,.docx,.doc,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
              
              <div className="text-center">
                <span className="text-3xl block mb-2">{selectedFile ? "📄" : "☁️"}</span>
                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-800 truncate max-w-md">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="file-upload-input"
                      className="text-sm font-bold text-blue-600 hover:text-blue-800 cursor-pointer transition-colors"
                    >
                      Click to browse
                    </label>
                    <span className="text-sm text-slate-500"> or drag and drop your file here</span>
                    <p className="text-[11px] text-slate-400 mt-1.5 font-medium">
                      PDF, DOCX, TXT (Max 10 MB)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Category selection */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Knowledge Base Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  <option>General</option>
                  <option>Billing</option>
                  <option>Technical</option>
                  <option>Returns</option>
                  <option>Legal/Compliance</option>
                </select>
              </div>

              <div className="self-end">
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploadLoading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-all duration-150 shadow-md shadow-blue-100 flex items-center gap-2"
                >
                  {uploadLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Ingesting...</span>
                    </>
                  ) : (
                    "Upload & Ingest"
                  )}
                </button>
              </div>
            </div>

            {uploadMsg && (
              <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex gap-2">
                <span>✓</span> <span>{uploadMsg}</span>
              </p>
            )}
            
            {uploadError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex gap-2">
                <span>⚠️</span> <span>{uploadError}</span>
              </p>
            )}
          </div>
        </div>

        {/* Document list */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800">Knowledge Source Index</h2>
            <span className="text-xs text-slate-400 font-bold">{docs.length} Documents</span>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-16 text-slate-400 gap-2">
              <svg className="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm">Loading database index...</span>
            </div>
          ) : docs.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">
              <p className="text-lg font-medium">No documents uploaded</p>
              <p className="text-xs mt-1 text-slate-400">Add documents to enable similarity responses.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {docs.map((doc) => (
                <li key={doc.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{doc.filename}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {doc.category && (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                          {doc.category}
                        </span>
                      )}
                      <span className="text-xs text-slate-300">•</span>
                      <span className="text-xs text-slate-400 font-medium">
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 border rounded-full capitalize ${
                        statusColors[doc.status] || "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {statusLabels[doc.status] || doc.status}
                    </span>
                    <button
                      onClick={() => deleteMutation.mutate(doc.id)}
                      disabled={deleteMutation.isLoading}
                      className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors py-1 px-2 hover:bg-red-50 rounded-lg"
                      aria-label={`Delete ${doc.filename}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
