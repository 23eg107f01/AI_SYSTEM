import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { AlertCircle, CheckCircle2, FileText, FolderOpen, Loader2, Trash2, UploadCloud } from "lucide-react";
import api from "../utils/api";
import { getApiErrorMessage } from "../utils/errorMessages";
import { useAuth } from "../hooks/useAuth";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Skeleton,
} from "../components/ui";

interface KBDocument {
  id: number;
  filename: string;
  category: string | null;
  status: string;
  uploaded_at: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".txt"];
const ACCEPTED_LABEL = "PDF, DOC, DOCX or TXT";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusVariant(status: string) {
  if (status === "ready" || status === "done") return "success" as const;
  if (status === "processing") return "warning" as const;
  if (status === "error" || status === "failed") return "error" as const;
  return "neutral" as const;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    ready: "Ready",
    done: "Ready",
    processing: "Processing",
    pending: "Pending",
    error: "Failed",
    failed: "Failed",
  };
  return labels[status] || status;
}

function DocumentsSkeleton() {
  return (
    <div className="divide-y divide-slate-100" role="status" aria-label="Loading knowledge base">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-5 py-4 sm:px-6">
          <Skeleton variant="circle" className="h-10 w-10 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
          <Skeleton className="hidden h-6 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}

export default function AdminPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState("General");
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KBDocument | null>(null);

  const canManage = user?.role === "admin";
  const documentsQuery = useQuery<KBDocument[]>(
    "kb-docs",
    () => api.get<KBDocument[]>("/api/kb").then((response) => response.data),
    {
      enabled: Boolean(user),
      refetchInterval: (data) => data?.some((doc) => doc.status === "processing" || doc.status === "pending") ? 3000 : 15000,
      refetchOnWindowFocus: true,
    }
  );

  const uploadMutation = useMutation(
    async () => {
      if (!selectedFile) throw new Error("Choose a document before uploading.");
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("category", category);
      return api.post<{ filename: string }>("/admin/upload-kb", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (event.total) setUploadProgress(Math.round((event.loaded / event.total) * 100));
        },
      });
    },
    {
      onSuccess: (response) => {
        setFeedback({ type: "success", message: `"${response.data.filename}" uploaded. Ingestion is processing in the background.` });
        setSelectedFile(null);
        setUploadProgress(100);
        if (inputRef.current) inputRef.current.value = "";
        queryClient.invalidateQueries("kb-docs");
      },
      onError: (error: unknown) => {
        const message = getApiErrorMessage(error, "Upload failed. Please try again.");
        setFeedback({ type: "error", message });
        setUploadProgress(0);
      },
      onSettled: () => {
        window.setTimeout(() => setUploadProgress(0), 800);
      },
    }
  );

  const deleteMutation = useMutation(
    (documentId: number) => api.delete(`/api/kb/${documentId}`),
    {
      onSuccess: () => {
        setFeedback({ type: "success", message: "Document deleted from the knowledge base." });
        setDeleteTarget(null);
        queryClient.invalidateQueries("kb-docs");
      },
      onError: () => setFeedback({ type: "error", message: "Document could not be deleted. Please try again." }),
    }
  );

  function validateAndSetFile(file: File | null) {
    setFeedback(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setSelectedFile(null);
      setFeedback({ type: "error", message: `Unsupported file type "${extension}". Allowed: ${ACCEPTED_EXTENSIONS.join(", ")}.` });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      setFeedback({ type: "error", message: "File is larger than the 10 MB limit." });
      return;
    }
    setSelectedFile(file);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    validateAndSetFile(event.target.files?.[0] || null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (canManage && !uploadMutation.isLoading) validateAndSetFile(event.dataTransfer.files?.[0] || null);
  }

  const documents = documentsQuery.data || [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content operations"
        title="Knowledge Base"
        description="Manage the documents that ground AI-generated support responses."
        actions={<span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">{documents.length} {documents.length === 1 ? "document" : "documents"}</span>}
      />

      {feedback && (
        <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${feedback.type === "success" ? "border-success-200 bg-success-50 text-success-800" : "border-error-200 bg-error-50 text-error-800"}`} role={feedback.type === "error" ? "alert" : "status"} aria-live="polite">
          {feedback.type === "success" ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {canManage ? (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
            <h2 className="text-base font-semibold text-slate-950">Add a knowledge source</h2>
            <p className="mt-1 text-sm text-slate-500">Upload a document to make its content available to retrieval-augmented responses.</p>
          </div>
          <div className="space-y-5 p-5 sm:p-6">
            <div
              role="button"
              tabIndex={uploadMutation.isLoading ? -1 : 0}
              aria-disabled={uploadMutation.isLoading}
              aria-label="Choose a knowledge base document to upload"
              onClick={() => !uploadMutation.isLoading && inputRef.current?.click()}
              onKeyDown={(event) => {
                if (!uploadMutation.isLoading && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed p-7 text-center transition-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${dragActive ? "border-brand-500 bg-brand-50" : selectedFile ? "border-success-300 bg-success-50/40" : "border-slate-300 bg-slate-50/70 hover:border-brand-300 hover:bg-brand-50/40"}`}
            >
              <input ref={inputRef} id="kb-file-input" type="file" accept={ACCEPTED_EXTENSIONS.join(",")} onChange={handleFileChange} className="sr-only" />
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                {selectedFile ? <FileText aria-hidden="true" className="h-5 w-5" /> : <UploadCloud aria-hidden="true" className="h-5 w-5" />}
              </div>
              {selectedFile ? (
                <><p className="mt-3 truncate text-sm font-semibold text-slate-900">{selectedFile.name}</p><p className="mt-1 text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Ready to upload</p></>
              ) : (
                <><p className="mt-3 text-sm font-semibold text-slate-900">Drop a document here or <span className="text-brand-700 underline underline-offset-2">browse files</span></p><p className="mt-1 text-xs text-slate-500">{ACCEPTED_LABEL} · Maximum 10 MB</p></>
              )}
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="kb-category" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">Document category</label>
                <Select id="kb-category" value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option>General</option><option>Billing</option><option>Technical</option><option>Returns</option><option>Legal/Compliance</option>
                </Select>
              </div>
              <Button type="button" onClick={() => uploadMutation.mutate()} disabled={!selectedFile} loading={uploadMutation.isLoading} className="shrink-0">
                <UploadCloud aria-hidden="true" className="h-4 w-4" /> Upload document
              </Button>
            </div>
            {uploadMutation.isLoading && (
              <div role="status" aria-live="polite">
                <div className="mb-1 flex justify-between text-xs font-medium text-slate-600"><span>Uploading document</span><span>{uploadProgress}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${uploadProgress}%` }} /></div>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card className="flex items-start gap-3 border-info-100 bg-info-50/60 p-5">
          <FolderOpen aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-info-700" />
          <div><p className="text-sm font-semibold text-info-900">View-only knowledge base</p><p className="mt-1 text-sm text-info-800">Only administrators can upload or delete documents.</p></div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div><h2 className="text-base font-semibold text-slate-950">Knowledge sources</h2><p className="mt-1 text-xs text-slate-500">Processing status updates automatically.</p></div>
          {documents.some((doc) => doc.status === "processing" || doc.status === "pending") && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-700"><Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> Indexing</span>}
        </div>
        {documentsQuery.isLoading ? <DocumentsSkeleton /> : documentsQuery.isError ? <div className="p-5"><ErrorState description="We couldn't load the knowledge base." action={<Button variant="outline" size="sm" onClick={() => documentsQuery.refetch()}>Try again</Button>} /></div> : documents.length === 0 ? (
          <div className="p-5"><EmptyState title="No knowledge sources yet" description={canManage ? "Upload a document to ground AI responses in your support content." : "Documents added by administrators will appear here."} icon={<FolderOpen aria-hidden="true" className="h-5 w-5" />} /></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left"><caption className="sr-only">Knowledge base documents</caption><thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-6 py-3">Document</th><th scope="col" className="px-6 py-3">Category</th><th scope="col" className="px-6 py-3">Uploaded</th><th scope="col" className="px-6 py-3">Status</th><th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody className="divide-y divide-slate-100">{documents.map((doc) => <tr key={doc.id} className="hover:bg-slate-50/70"><th scope="row" className="max-w-[320px] px-6 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><FileText aria-hidden="true" className="h-4 w-4" /></span><span className="min-w-0 truncate text-sm font-semibold text-slate-900" title={doc.filename}>{doc.filename}</span></div></th><td className="px-6 py-4 text-sm text-slate-600">{doc.category || "General"}</td><td className="whitespace-nowrap px-6 py-4 text-xs text-slate-500"><time dateTime={doc.uploaded_at}>{formatDate(doc.uploaded_at)}</time></td><td className="px-6 py-4"><Badge variant={statusVariant(doc.status)}>{statusLabel(doc.status)}</Badge></td><td className="px-6 py-4 text-right">{canManage && <Button type="button" variant="ghost" size="sm" className="text-error-700 hover:bg-error-50" onClick={() => setDeleteTarget(doc)} disabled={deleteMutation.isLoading}><Trash2 aria-hidden="true" className="h-4 w-4" /> Delete</Button>}</td></tr>)}</tbody></table>
            </div>
            <div className="divide-y divide-slate-100 md:hidden">{documents.map((doc) => <article key={doc.id} className="p-4"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><FileText aria-hidden="true" className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-slate-900">{doc.filename}</h3><p className="mt-1 text-xs text-slate-500">{doc.category || "General"} · {formatDate(doc.uploaded_at)}</p><div className="mt-3 flex items-center justify-between gap-3"><Badge variant={statusVariant(doc.status)}>{statusLabel(doc.status)}</Badge>{canManage && <Button type="button" variant="ghost" size="sm" className="text-error-700 hover:bg-error-50" onClick={() => setDeleteTarget(doc)} disabled={deleteMutation.isLoading}><Trash2 aria-hidden="true" className="h-4 w-4" /> Delete</Button>}</div></div></div></article>)}</div>
          </>
        )}
      </Card>

      <Dialog open={Boolean(deleteTarget)} onClose={() => !deleteMutation.isLoading && setDeleteTarget(null)} title="Delete document?" description={`"${deleteTarget?.filename}" will be removed from the knowledge base and its indexed content.`}>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isLoading}>Cancel</Button><Button type="button" variant="danger" loading={deleteMutation.isLoading} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}><Trash2 aria-hidden="true" className="h-4 w-4" /> Delete document</Button></div>
      </Dialog>
    </div>
  );
}
