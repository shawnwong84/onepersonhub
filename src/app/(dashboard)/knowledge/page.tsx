"use client";

import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";
import { unwrapListResponse } from "@/lib/api-response";
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  X,
  FolderOpen,
  FileText,
  ChevronRight,
  AlertCircle,
  Star,
  ArrowUp,
  Minus,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Upload,
  Globe2,
  RefreshCw,
  Database,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryWithCount {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  sortOrder: number;
  _count: { entries: number };
}

interface EntryCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
}

interface KnowledgeEntry {
  id: string;
  categoryId: string;
  category: EntryCategory;
  title: string;
  content: string;
  priority: number;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeDocument {
  id: string;
  title: string;
  sourceType: string;
  fileName: string;
  sourceUrl: string;
  status: string;
  tokenEstimate: number;
  version: number;
  updatedAt: string;
  _count?: { chunks?: number; runs?: number };
  runs?: Array<{ id: string; status: string; stage: string; error: string }>;
}

interface KnowledgeDocumentDetail extends KnowledgeDocument {
  extractedText: string;
  tableData: unknown;
  previewUrl?: string;
  chunks?: Array<{ id: string; content: string; chunkIndex: number }>;
  runs?: Array<{
    id: string;
    status: string;
    stage: string;
    error: string;
    logs?: Array<{ at: string; stage: string; message: string }>;
    createdAt?: string;
  }>;
}

interface TokenTotals {
  promptTokens?: number | null;
  completionTokens?: number | null;
  embeddingTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
}

// ---------------------------------------------------------------------------
// Priority helpers
// ---------------------------------------------------------------------------

const PRIORITIES = [
  { value: 0, label: "Normal", icon: Minus, className: "bg-gray-100 text-gray-600" },
  { value: 1, label: "Medium", icon: ArrowUp, className: "bg-yellow-100 text-yellow-700" },
  { value: 2, label: "High", icon: ArrowUp, className: "bg-orange-100 text-orange-700" },
  { value: 3, label: "Critical", icon: Star, className: "bg-red-100 text-red-700" },
];

function getPriority(value: number) {
  return PRIORITIES.find((p) => p.value === value) || PRIORITIES[0];
}

// ---------------------------------------------------------------------------
// Category icon mapping (lucide subset as colored circles with letter)
// ---------------------------------------------------------------------------

function CategoryIcon({ color, name }: { color: string; name: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-sm font-semibold flex-shrink-0"
      style={{ backgroundColor: color }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function KnowledgeBasePage() {
  // --- State ---
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [tokenTotals, setTokenTotals] = useState<TokenTotals>({});
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [ingestionError, setIngestionError] = useState("");
  const [selectedDocument, setSelectedDocument] =
    useState<KnowledgeDocumentDetail | null>(null);
  const [documentDraft, setDocumentDraft] = useState({
    title: "",
    extractedText: "",
  });
  const [savingDocument, setSavingDocument] = useState(false);
  const [documentView, setDocumentView] = useState<"text" | "table">("text");

  // Category modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithCount | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", icon: "folder", color: "#4A7C9B" });
  const [savingCategory, setSavingCategory] = useState(false);

  // Entry modal
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [entryForm, setEntryForm] = useState({ title: "", content: "", priority: 0 });
  const [savingEntry, setSavingEntry] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: "category" | "entry"; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // --- Data fetching ---

  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const res = await fetch("/api/knowledge/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(unwrapListResponse<CategoryWithCount>(data));
      }
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  const fetchEntries = useCallback(async (categoryId: string) => {
    setLoadingEntries(true);
    try {
      const res = await fetch(`/api/knowledge/entries?categoryId=${categoryId}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(unwrapListResponse<KnowledgeEntry>(data));
      }
    } catch (err) {
      console.error("Failed to fetch entries:", err);
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  const fetchDocuments = useCallback(async (categoryId?: string | null) => {
    setLoadingDocuments(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (categoryId) params.set("categoryId", categoryId);
      const res = await fetch(`/api/knowledge/documents?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(unwrapListResponse<KnowledgeDocument>(data));
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    } finally {
      setLoadingDocuments(false);
    }
  }, []);

  const fetchTokenTotals = useCallback(async () => {
    try {
      const res = await fetch("/api/token-usage?feature=knowledge_ingestion");
      if (res.ok) {
        const data = await res.json();
        setTokenTotals(data.totals || {});
      }
    } catch (err) {
      console.error("Failed to fetch token usage:", err);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (selectedCategoryId) {
      fetchEntries(selectedCategoryId);
      fetchDocuments(selectedCategoryId);
    } else {
      setEntries([]);
      fetchDocuments(null);
    }
  }, [selectedCategoryId, fetchEntries, fetchDocuments]);

  useEffect(() => {
    fetchTokenTotals();
  }, [fetchTokenTotals]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) || null;

  // --- Category CRUD ---

  function openCategoryModal(category?: CategoryWithCount) {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        description: category.description,
        icon: category.icon,
        color: category.color,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({ name: "", description: "", icon: "folder", color: "#4A7C9B" });
    }
    setShowCategoryModal(true);
  }

  async function saveCategory() {
    if (!categoryForm.name.trim()) return;
    setSavingCategory(true);
    try {
      const url = editingCategory
        ? `/api/knowledge/categories/${editingCategory.id}`
        : "/api/knowledge/categories";
      const method = editingCategory ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryForm),
      });
      if (res.ok) {
        setShowCategoryModal(false);
        await fetchCategories();
      }
    } catch (err) {
      console.error("Failed to save category:", err);
    } finally {
      setSavingCategory(false);
    }
  }

  // --- Entry CRUD ---

  function openEntryModal(entry?: KnowledgeEntry) {
    if (entry) {
      setEditingEntry(entry);
      setEntryForm({ title: entry.title, content: entry.content, priority: entry.priority });
    } else {
      setEditingEntry(null);
      setEntryForm({ title: "", content: "", priority: 0 });
    }
    setShowEntryModal(true);
  }

  async function saveEntry() {
    if (!entryForm.title.trim() || !selectedCategoryId) return;
    setSavingEntry(true);
    try {
      const url = editingEntry
        ? `/api/knowledge/entries/${editingEntry.id}`
        : "/api/knowledge/entries";
      const method = editingEntry ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...entryForm, categoryId: selectedCategoryId }),
      });
      if (res.ok) {
        setShowEntryModal(false);
        await fetchEntries(selectedCategoryId);
        await fetchCategories();
      }
    } catch (err) {
      console.error("Failed to save entry:", err);
    } finally {
      setSavingEntry(false);
    }
  }

  async function toggleEntryActive(entry: KnowledgeEntry) {
    try {
      const res = await fetch(`/api/knowledge/entries/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !entry.isActive }),
      });
      if (res.ok && selectedCategoryId) {
        await fetchEntries(selectedCategoryId);
      }
    } catch (err) {
      console.error("Failed to toggle entry:", err);
    }
  }

  async function uploadDocument() {
    if (!uploadFile || !selectedCategoryId || ingesting) return;
    setIngestionError("");
    setIngesting(true);
    try {
      const formData = new FormData();
      formData.set("file", uploadFile);
      formData.set("categoryId", selectedCategoryId);
      formData.set("title", uploadFile.name);

      const res = await fetch("/api/knowledge/documents", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setIngestionError(data.error || "Failed to upload document");
        return;
      }
      setUploadFile(null);
      await fetchDocuments(selectedCategoryId);
      await fetchEntries(selectedCategoryId);
      await fetchCategories();
      await fetchTokenTotals();
    } catch (err) {
      console.error("Failed to upload document:", err);
      setIngestionError("Failed to upload document");
    } finally {
      setIngesting(false);
    }
  }

  async function ingestWebsite() {
    if (!websiteUrl.trim() || !selectedCategoryId || ingesting) return;
    setIngestionError("");
    setIngesting(true);
    try {
      const res = await fetch("/api/knowledge/websites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl.trim(), categoryId: selectedCategoryId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIngestionError(data.error || "Failed to ingest website");
        return;
      }
      setWebsiteUrl("");
      await fetchDocuments(selectedCategoryId);
      await fetchEntries(selectedCategoryId);
      await fetchCategories();
      await fetchTokenTotals();
    } catch (err) {
      console.error("Failed to ingest website:", err);
      setIngestionError("Failed to ingest website");
    } finally {
      setIngesting(false);
    }
  }

  async function retryDocument(documentId: string) {
    if (ingesting || !selectedCategoryId) return;
    setIngestionError("");
    setIngesting(true);
    try {
      const res = await fetch(`/api/knowledge/documents/${documentId}/ingest`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setIngestionError(data.error || "Failed to reindex document");
        return;
      }
      await fetchDocuments(selectedCategoryId);
      await fetchEntries(selectedCategoryId);
      await fetchTokenTotals();
      if (selectedDocument?.id === documentId) {
        await openDocument(documentId);
      }
    } catch (err) {
      console.error("Failed to reindex document:", err);
      setIngestionError("Failed to reindex document");
    } finally {
      setIngesting(false);
    }
  }

  async function openDocument(documentId: string) {
    try {
      const res = await fetch(`/api/knowledge/documents/${documentId}`);
      if (!res.ok) return;
      const data = await res.json();
      setSelectedDocument(data);
      setDocumentDraft({
        title: data.title || "",
        extractedText: data.extractedText || "",
      });
    } catch (err) {
      console.error("Failed to open document:", err);
    }
  }

  async function saveDocumentDraft() {
    if (!selectedDocument || savingDocument) return;
    setSavingDocument(true);
    try {
      const res = await fetch(`/api/knowledge/documents/${selectedDocument.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(documentDraft),
      });
      if (res.ok) {
        await openDocument(selectedDocument.id);
        if (selectedCategoryId) {
          await fetchDocuments(selectedCategoryId);
        }
      }
    } catch (err) {
      console.error("Failed to save document:", err);
    } finally {
      setSavingDocument(false);
    }
  }

  // CSV round-trip for the editable table view. Handles quoted cells.
  function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          cell += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        cell = "";
        rows.push(row);
        row = [];
      } else {
        cell += char;
      }
    }
    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }

  function serializeCsv(rows: string[][]): string {
    return rows
      .map((row) =>
        row
          .map((cell) => (/[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
          .join(",")
      )
      .join("\n");
  }

  function isTabular(document: KnowledgeDocumentDetail | null): boolean {
    if (!document) return false;
    const name = (document.fileName || "").toLowerCase();
    if (/(\.csv|\.xlsx|\.xls)$/.test(name)) return true;
    return getPreviewRows(document.tableData).length > 0;
  }

  function updateTableCell(rowIndex: number, cellIndex: number, value: string) {
    const rows = parseCsv(documentDraft.extractedText);
    if (!rows[rowIndex]) return;
    rows[rowIndex] = [...rows[rowIndex]];
    rows[rowIndex][cellIndex] = value;
    setDocumentDraft({ ...documentDraft, extractedText: serializeCsv(rows) });
  }

  function addTableRow() {
    const rows = parseCsv(documentDraft.extractedText);
    const width = rows[0]?.length || 1;
    rows.push(Array.from({ length: width }, () => ""));
    setDocumentDraft({ ...documentDraft, extractedText: serializeCsv(rows) });
  }

  function removeTableRow(rowIndex: number) {
    const rows = parseCsv(documentDraft.extractedText).filter((_, index) => index !== rowIndex);
    setDocumentDraft({ ...documentDraft, extractedText: serializeCsv(rows) });
  }

  function getPreviewRows(tableData: unknown): string[][] {
    if (!Array.isArray(tableData)) return [];
    const first = tableData[0] as unknown;
    if (Array.isArray(first)) {
      return tableData as string[][];
    }
    if (
      first &&
      typeof first === "object" &&
      "rows" in first &&
      Array.isArray((first as { rows?: unknown }).rows)
    ) {
      return ((first as { rows: unknown[] }).rows as unknown[][]).map((row) =>
        row.map((cell) => String(cell ?? ""))
      );
    }
    return [];
  }

  // --- Delete ---

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const url =
        deleteTarget.type === "category"
          ? `/api/knowledge/categories/${deleteTarget.id}`
          : `/api/knowledge/entries/${deleteTarget.id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        if (deleteTarget.type === "category") {
          if (selectedCategoryId === deleteTarget.id) {
            setSelectedCategoryId(null);
            setEntries([]);
          }
          await fetchCategories();
        } else if (selectedCategoryId) {
          await fetchEntries(selectedCategoryId);
          await fetchCategories();
        }
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  // --- Category color presets ---
  const colorPresets = [
    "#4A7C9B", "#2D5A7B", "#C4956A", "#6B8E5B", "#9B6B9E",
    "#C75C5C", "#D4964A", "#5B8E8E", "#7C6B9B", "#4A9B7C",
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <Header
        title="Knowledge Base"
        description="Manage your AI's knowledge and responses"
      />

      <div className="flex-1 overflow-hidden flex">
        {/* ================= LEFT PANEL: Categories ================= */}
        <div className="w-80 flex-shrink-0 border-r border-owly-border bg-owly-surface flex flex-col">
          <div className="px-4 py-3 border-b border-owly-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-owly-text">Categories</h3>
            <button
              onClick={() => openCategoryModal()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-owly-primary hover:bg-owly-primary-dark rounded-lg transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingCategories ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-owly-text-light" />
              </div>
            ) : categories.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <FolderOpen className="h-10 w-10 mx-auto mb-3 text-owly-text-light opacity-40" />
                <p className="text-sm font-medium text-owly-text-light">No categories yet</p>
                <p className="text-xs text-owly-text-light mt-1">
                  Create your first category to start organizing knowledge entries.
                </p>
                <button
                  onClick={() => openCategoryModal()}
                  className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-owly-primary border border-owly-primary/30 hover:bg-owly-primary-50 rounded-lg transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create Category
                </button>
              </div>
            ) : (
              <div className="py-1">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className={cn(
                      "group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
                      selectedCategoryId === cat.id
                        ? "bg-owly-primary-50 border-r-2 border-owly-primary"
                        : "hover:bg-owly-bg"
                    )}
                    onClick={() => setSelectedCategoryId(cat.id)}
                  >
                    <CategoryIcon color={cat.color} name={cat.name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-owly-text truncate">
                          {cat.name}
                        </p>
                        <span className="text-xs text-owly-text-light flex-shrink-0 ml-2">
                          {cat._count.entries}
                        </span>
                      </div>
                      {cat.description && (
                        <p className="text-xs text-owly-text-light truncate mt-0.5">
                          {cat.description}
                        </p>
                      )}
                    </div>
                    <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openCategoryModal(cat);
                        }}
                        className="p-1 text-owly-text-light hover:text-owly-primary rounded transition-colors"
                        title="Edit category"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ type: "category", id: cat.id, name: cat.name });
                        }}
                        className="p-1 text-owly-text-light hover:text-red-600 rounded transition-colors"
                        title="Delete category"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {selectedCategoryId === cat.id && (
                      <ChevronRight className="h-4 w-4 text-owly-primary flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ================= RIGHT PANEL: Entries ================= */}
        <div className="flex-1 flex flex-col min-w-0 bg-owly-bg">
          {!selectedCategory ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <BookOpen className="h-12 w-12 mx-auto mb-4 text-owly-text-light opacity-30" />
                <p className="text-lg font-medium text-owly-text-light">
                  Select a category
                </p>
                <p className="text-sm text-owly-text-light mt-1">
                  Choose a category from the left panel to view and manage its entries.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Entries header */}
              <div className="px-6 py-3 border-b border-owly-border bg-owly-surface flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CategoryIcon color={selectedCategory.color} name={selectedCategory.name} />
                  <div>
                    <h3 className="text-sm font-semibold text-owly-text">
                      {selectedCategory.name}
                    </h3>
                    {selectedCategory.description && (
                      <p className="text-xs text-owly-text-light">
                        {selectedCategory.description}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openEntryModal()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-owly-primary hover:bg-owly-primary-dark rounded-lg transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Entry
                </button>
              </div>

              {/* RAG document library */}
              <div className="border-b border-owly-border bg-owly-surface px-6 py-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-owly-primary" />
                      <h4 className="text-sm font-semibold text-owly-text">
                        RAG Document Library
                      </h4>
                      <span className="rounded-full bg-owly-primary-50 px-2 py-0.5 text-xs font-medium text-owly-primary">
                        {(tokenTotals.totalTokens || 0).toLocaleString()} tokens
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-owly-text-light">
                      Upload TXT, Markdown, HTML, CSV, DOCX, PDF, XLSX, or images. Image OCR uses English by default.
                    </p>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2 xl:w-[720px]">
                    <div className="flex items-center gap-2 rounded-lg border border-owly-border bg-owly-bg p-2">
                      <Upload className="h-4 w-4 text-owly-text-light" />
                      <input
                        type="file"
                        accept=".txt,.md,.markdown,.html,.htm,.csv,.pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp"
                        onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                        className="min-w-0 flex-1 text-xs text-owly-text"
                      />
                      <button
                        onClick={uploadDocument}
                        disabled={!uploadFile || ingesting}
                        className="rounded-md bg-owly-primary px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Upload
                      </button>
                    </div>

                    <div className="flex items-center gap-2 rounded-lg border border-owly-border bg-owly-bg p-2">
                      <Globe2 className="h-4 w-4 text-owly-text-light" />
                      <input
                        type="url"
                        value={websiteUrl}
                        onChange={(event) => setWebsiteUrl(event.target.value)}
                        placeholder="https://example.com/help"
                        className="min-w-0 flex-1 bg-transparent text-xs text-owly-text outline-none placeholder:text-owly-text-light"
                      />
                      <button
                        onClick={ingestWebsite}
                        disabled={!websiteUrl.trim() || ingesting}
                        className="rounded-md bg-owly-primary px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Crawl
                      </button>
                    </div>
                  </div>
                </div>

                {ingestionError && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {ingestionError}
                  </div>
                )}

                <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                  {loadingDocuments ? (
                    <div className="rounded-lg border border-owly-border bg-owly-bg p-3 text-xs text-owly-text-light">
                      Loading documents...
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-owly-border bg-owly-bg p-3 text-xs text-owly-text-light">
                      No documents ingested for this category yet.
                    </div>
                  ) : (
                    documents.slice(0, 6).map((document) => {
                      const latestRun = document.runs?.[0];
                      return (
                        <div
                          key={document.id}
                          className="rounded-lg border border-owly-border bg-owly-bg p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-owly-text">
                                {document.title}
                              </p>
                              <p className="truncate text-xs text-owly-text-light">
                                {document.sourceType === "website"
                                  ? document.sourceUrl
                                  : document.fileName || "Text source"}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-medium",
                                document.status === "indexed"
                                  ? "bg-green-100 text-green-700"
                                  : document.status === "failed"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-yellow-100 text-yellow-700"
                              )}
                            >
                              {document.status}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-owly-text-light">
                            <span>{document._count?.chunks || 0} chunks</span>
                            <span>{document.tokenEstimate.toLocaleString()} tokens</span>
                          </div>
                          {latestRun?.error && (
                            <p className="mt-2 line-clamp-2 text-xs text-red-600">
                              {latestRun.error}
                            </p>
                          )}
                          <button
                            onClick={() => openDocument(document.id)}
                            className="mt-3 mr-2 inline-flex items-center gap-1 rounded-md border border-owly-border px-2 py-1 text-xs font-medium text-owly-text hover:bg-owly-surface"
                          >
                            <FileText className="h-3 w-3" />
                            Open
                          </button>
                          <button
                            onClick={() => retryDocument(document.id)}
                            disabled={ingesting}
                            className="mt-3 inline-flex items-center gap-1 rounded-md border border-owly-border px-2 py-1 text-xs font-medium text-owly-text hover:bg-owly-surface disabled:opacity-50"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Reindex
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Entries list */}
              <div className="flex-1 overflow-y-auto p-6">
                {loadingEntries ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-owly-text-light" />
                  </div>
                ) : entries.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-10 w-10 mx-auto mb-3 text-owly-text-light opacity-40" />
                    <p className="text-sm font-medium text-owly-text-light">
                      No entries in this category
                    </p>
                    <p className="text-xs text-owly-text-light mt-1">
                      Add knowledge entries that the AI can use when responding to customers.
                    </p>
                    <button
                      onClick={() => openEntryModal()}
                      className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-owly-primary border border-owly-primary/30 hover:bg-owly-primary-50 rounded-lg transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add First Entry
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {entries.map((entry) => {
                      const priority = getPriority(entry.priority);
                      const PriorityIcon = priority.icon;
                      const contentPreview = entry.content
                        ? entry.content.split("\n")[0].slice(0, 120)
                        : "";

                      return (
                        <div
                          key={entry.id}
                          className={cn(
                            "bg-owly-surface rounded-xl border border-owly-border p-4 transition-all hover:shadow-sm",
                            !entry.isActive && "opacity-60"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-medium text-owly-text">
                                  {entry.title}
                                </h4>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
                                    priority.className
                                  )}
                                >
                                  <PriorityIcon className="h-3 w-3" />
                                  {priority.label}
                                </span>
                                {!entry.isActive && (
                                  <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                                    Inactive
                                  </span>
                                )}
                              </div>
                              {contentPreview && (
                                <p className="text-xs text-owly-text-light mt-1 truncate">
                                  {contentPreview}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => toggleEntryActive(entry)}
                                className={cn(
                                  "p-1.5 rounded transition-colors",
                                  entry.isActive
                                    ? "text-owly-primary hover:bg-owly-primary-50"
                                    : "text-owly-text-light hover:bg-gray-100"
                                )}
                                title={entry.isActive ? "Deactivate" : "Activate"}
                              >
                                {entry.isActive ? (
                                  <ToggleRight className="h-4 w-4" />
                                ) : (
                                  <ToggleLeft className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                onClick={() => openEntryModal(entry)}
                                className="p-1.5 text-owly-text-light hover:text-owly-primary hover:bg-owly-primary-50 rounded transition-colors"
                                title="Edit entry"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteTarget({ type: "entry", id: entry.id, name: entry.title })
                                }
                                className="p-1.5 text-owly-text-light hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Delete entry"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ================= CATEGORY MODAL ================= */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowCategoryModal(false)}
          />
          <div className="relative bg-owly-surface rounded-xl shadow-xl border border-owly-border w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-owly-border">
              <h3 className="font-semibold text-owly-text">
                {editingCategory ? "Edit Category" : "New Category"}
              </h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="p-1 text-owly-text-light hover:text-owly-text rounded transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-owly-text mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="e.g. Product FAQ, Returns Policy"
                  className="w-full px-3 py-2 text-sm border border-owly-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-owly-text mb-1.5">
                  Description
                </label>
                <input
                  type="text"
                  value={categoryForm.description}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, description: e.target.value })
                  }
                  placeholder="Brief description of this category"
                  className="w-full px-3 py-2 text-sm border border-owly-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-owly-text mb-1.5">
                  Color
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {colorPresets.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategoryForm({ ...categoryForm, color: c })}
                      className={cn(
                        "w-7 h-7 rounded-full transition-all",
                        categoryForm.color === c
                          ? "ring-2 ring-offset-2 ring-owly-primary scale-110"
                          : "hover:scale-110"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={categoryForm.color}
                    onChange={(e) =>
                      setCategoryForm({ ...categoryForm, color: e.target.value })
                    }
                    className="w-7 h-7 rounded cursor-pointer border border-owly-border"
                    title="Custom color"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-owly-border">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="px-4 py-2 text-sm font-medium text-owly-text-light hover:text-owly-text rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCategory}
                disabled={!categoryForm.name.trim() || savingCategory}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-owly-primary hover:bg-owly-primary-dark disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {savingCategory && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingCategory ? "Save Changes" : "Create Category"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= ENTRY MODAL ================= */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowEntryModal(false)}
          />
          <div className="relative bg-owly-surface rounded-xl shadow-xl border border-owly-border w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-owly-border">
              <h3 className="font-semibold text-owly-text">
                {editingEntry ? "Edit Entry" : "New Entry"}
              </h3>
              <button
                onClick={() => setShowEntryModal(false)}
                className="p-1 text-owly-text-light hover:text-owly-text rounded transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-owly-text mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={entryForm.title}
                  onChange={(e) => setEntryForm({ ...entryForm, title: e.target.value })}
                  placeholder="e.g. How to reset password"
                  className="w-full px-3 py-2 text-sm border border-owly-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-owly-text mb-1.5">
                  Content
                </label>
                <textarea
                  value={entryForm.content}
                  onChange={(e) => setEntryForm({ ...entryForm, content: e.target.value })}
                  placeholder="Write the knowledge content that the AI will use when responding to customers..."
                  rows={8}
                  className="w-full px-3 py-2 text-sm border border-owly-border rounded-lg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-owly-text mb-1.5">
                  Priority
                </label>
                <div className="flex items-center gap-2">
                  {PRIORITIES.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.value}
                        onClick={() => setEntryForm({ ...entryForm, priority: p.value })}
                        className={cn(
                          "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                          entryForm.priority === p.value
                            ? cn(p.className, "border-current ring-1 ring-current/20")
                            : "border-owly-border text-owly-text-light hover:border-owly-primary/30"
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-owly-border">
              <button
                onClick={() => setShowEntryModal(false)}
                className="px-4 py-2 text-sm font-medium text-owly-text-light hover:text-owly-text rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEntry}
                disabled={!entryForm.title.trim() || savingEntry}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-owly-primary hover:bg-owly-primary-dark disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {savingEntry && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingEntry ? "Save Changes" : "Create Entry"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= DOCUMENT DETAIL ================= */}
      {selectedDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSelectedDocument(null)}
          />
          <div className="relative flex h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-owly-border bg-owly-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-owly-border px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-owly-primary">
                  Knowledge Document
                </p>
                <h3 className="truncate font-semibold text-owly-text">
                  {selectedDocument.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDocument(null)}
                className="rounded p-1 text-owly-text-light hover:text-owly-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[380px_1fr]">
              <div className="overflow-y-auto border-r border-owly-border p-4">
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-owly-text-light">
                      Title
                    </label>
                    <input
                      value={documentDraft.title}
                      onChange={(event) =>
                        setDocumentDraft({
                          ...documentDraft,
                          title: event.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-owly-border bg-owly-bg px-3 py-2 text-sm text-owly-text outline-none focus:border-owly-primary"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-owly-bg p-2">
                      <p className="text-owly-text-light">Status</p>
                      <p className="font-medium text-owly-text">
                        {selectedDocument.status}
                      </p>
                    </div>
                    <div className="rounded-lg bg-owly-bg p-2">
                      <p className="text-owly-text-light">Tokens</p>
                      <p className="font-medium text-owly-text">
                        {selectedDocument.tokenEstimate.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg bg-owly-bg p-2">
                      <p className="text-owly-text-light">Chunks</p>
                      <p className="font-medium text-owly-text">
                        {selectedDocument.chunks?.length || 0}
                      </p>
                    </div>
                    <div className="rounded-lg bg-owly-bg p-2">
                      <p className="text-owly-text-light">Version</p>
                      <p className="font-medium text-owly-text">
                        {selectedDocument.version}
                      </p>
                    </div>
                  </div>

                  {selectedDocument.previewUrl && (
                    <a
                      href={selectedDocument.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-full items-center justify-center rounded-lg border border-owly-border px-3 py-2 text-sm font-medium text-owly-text hover:bg-owly-bg"
                    >
                      Open source file
                    </a>
                  )}

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                      Ingestion Runs
                    </p>
                    <div className="space-y-2">
                      {(selectedDocument.runs || []).slice(0, 4).map((run) => (
                        <div
                          key={run.id}
                          className="rounded-lg border border-owly-border bg-owly-bg p-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-owly-text">
                              {run.stage}
                            </span>
                            <span className="text-owly-text-light">
                              {run.status}
                            </span>
                          </div>
                          {run.error && (
                            <p className="mt-1 text-red-600">{run.error}</p>
                          )}
                          {(run.logs || []).slice(-3).map((log) => (
                            <p key={`${run.id}-${log.at}`} className="mt-1 text-owly-text-light">
                              {log.stage}: {log.message}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-col">
                <div className="flex items-center justify-between border-b border-owly-border px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-owly-text">
                      Extracted content editor
                    </p>
                    <p className="text-xs text-owly-text-light">
                      Save edits, then reindex to update searchable chunks.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={saveDocumentDraft}
                      disabled={savingDocument}
                      className="rounded-lg border border-owly-border px-3 py-2 text-sm font-medium text-owly-text hover:bg-owly-bg disabled:opacity-50"
                    >
                      {savingDocument ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => retryDocument(selectedDocument.id)}
                      disabled={ingesting}
                      className="rounded-lg bg-owly-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Reindex
                    </button>
                  </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr_auto]">
                  {isTabular(selectedDocument) && (
                    <div className="flex items-center gap-1 border-b border-owly-border bg-owly-surface px-4 py-2">
                      <button
                        type="button"
                        onClick={() => setDocumentView("text")}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold ${documentView === "text" ? "bg-owly-primary text-white" : "text-owly-text-light hover:bg-owly-bg"}`}
                      >
                        Text
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocumentView("table")}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold ${documentView === "table" ? "bg-owly-primary text-white" : "text-owly-text-light hover:bg-owly-bg"}`}
                      >
                        Table editor
                      </button>
                      {documentView === "table" && (
                        <button
                          type="button"
                          onClick={addTableRow}
                          className="ml-auto rounded-md border border-owly-border px-2.5 py-1 text-xs font-semibold text-owly-text hover:bg-owly-bg"
                        >
                          + Row
                        </button>
                      )}
                    </div>
                  )}
                  {documentView === "table" && isTabular(selectedDocument) ? (
                    <div className="min-h-0 overflow-auto bg-owly-bg p-4">
                      <table className="w-full border-collapse text-xs">
                        <tbody>
                          {parseCsv(documentDraft.extractedText).map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="border border-owly-border p-0">
                                  <input
                                    value={cell}
                                    onChange={(event) =>
                                      updateTableCell(rowIndex, cellIndex, event.target.value)
                                    }
                                    className={`w-full min-w-[90px] bg-transparent px-2 py-1 text-owly-text outline-none focus:bg-owly-primary-50 ${rowIndex === 0 ? "font-semibold" : ""}`}
                                  />
                                </td>
                              ))}
                              <td className="border-0 pl-1">
                                {rowIndex > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => removeTableRow(rowIndex)}
                                    className="rounded px-1 text-owly-text-light hover:text-red-600"
                                    title="Remove row"
                                  >
                                    &times;
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-3 text-xs text-owly-text-light">
                        Edits update the document text as CSV. Save and reindex to apply.
                      </p>
                    </div>
                  ) : (
                  <textarea
                    value={documentDraft.extractedText}
                    onChange={(event) =>
                      setDocumentDraft({
                        ...documentDraft,
                        extractedText: event.target.value,
                      })
                    }
                    className="min-h-0 w-full resize-none border-0 bg-owly-bg p-4 font-mono text-sm text-owly-text outline-none"
                  />
                  )}

                  {getPreviewRows(selectedDocument.tableData).length > 0 && (
                    <div className="max-h-56 overflow-auto border-t border-owly-border bg-owly-surface p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                        Table Preview
                      </p>
                      <table className="w-full border-collapse text-xs">
                        <tbody>
                          {getPreviewRows(selectedDocument.tableData)
                            .slice(0, 20)
                            .map((row, rowIndex) => (
                              <tr key={rowIndex}>
                                {row.slice(0, 8).map((cell, cellIndex) => (
                                  <td
                                    key={cellIndex}
                                    className="border border-owly-border px-2 py-1 text-owly-text"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= DELETE CONFIRMATION ================= */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative bg-owly-surface rounded-xl shadow-xl border border-owly-border w-full max-w-sm mx-4">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-full bg-red-50">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="font-semibold text-owly-text">
                  Delete {deleteTarget.type === "category" ? "Category" : "Entry"}
                </h3>
              </div>
              <p className="text-sm text-owly-text-light">
                Are you sure you want to delete{" "}
                <span className="font-medium text-owly-text">{deleteTarget.name}</span>?
                {deleteTarget.type === "category" &&
                  " This will also delete all entries in this category."}
                {" "}This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-owly-border">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-medium text-owly-text-light hover:text-owly-text rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
