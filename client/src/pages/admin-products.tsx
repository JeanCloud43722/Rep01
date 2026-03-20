import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Plus, Pencil, Trash2, Upload, ImageOff,
  PackageSearch, Loader2, Search, X, Check, Package
} from "lucide-react";
import type { Product } from "@shared/schema";

// ─── Debounce hook ─────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProductVariant { name: string; price: string; description: string; }

interface ProductFormState {
  name: string;
  description: string;
  price: string;
  category: string;
  categoryGroup: string;
  allergens: string;
  tags: string[];
  imageUrl: string;
  isActive: boolean;
  variants: ProductVariant[];
  defaultVariant: string;
}

const PREDEFINED_TAGS = ["vegetarian", "vegan", "gluten-free", "spicy", "popular", "seasonal", "new"];

const emptyForm = (): ProductFormState => ({
  name: "",
  description: "",
  price: "",
  category: "",
  categoryGroup: "",
  allergens: "",
  tags: [],
  imageUrl: "",
  isActive: true,
  variants: [],
  defaultVariant: "",
});

function productToForm(p: Product): ProductFormState {
  return {
    name: p.name,
    description: p.description ?? "",
    price: p.price != null ? String(p.price) : "",
    category: p.category,
    categoryGroup: p.categoryGroup ?? "",
    allergens: (p.allergens ?? []).join(", "),
    tags: p.tags ?? [],
    imageUrl: p.imageUrl ?? "",
    isActive: p.isActive,
    variants: (p.variants ?? []).map((v) => ({
      name: v.name,
      price: String(v.price),
      description: v.description ?? "",
    })),
    defaultVariant: p.defaultVariant ?? "",
  };
}

function formToPayload(f: ProductFormState) {
  const parsedPrice = parseFloat(f.price);
  const validVariants = f.variants.filter((v) => v.name.trim() && parseFloat(v.price) > 0);
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    price: !isNaN(parsedPrice) && parsedPrice > 0 ? parsedPrice : null,
    category: f.category.trim(),
    categoryGroup: f.categoryGroup.trim() || null,
    allergens: f.allergens.split(",").map((s) => s.trim()).filter(Boolean),
    tags: f.tags,
    imageUrl: f.imageUrl || null,
    isActive: f.isActive,
    variants: validVariants.length
      ? validVariants.map((v) => ({ name: v.name.trim(), price: parseFloat(v.price), description: v.description.trim() || undefined }))
      : null,
    defaultVariant: f.defaultVariant.trim() || null,
  };
}

// ─── Image upload area ─────────────────────────────────────────────────────────
function ImageUploadArea({
  imageUrl, onUploaded, isUploading, setIsUploading,
}: {
  imageUrl: string;
  onUploaded: (url: string) => void;
  isUploading: boolean;
  setIsUploading: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/admin/products/upload-image", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      onUploaded(url);
    } catch {
      toast({ title: "Upload failed", description: "Could not upload the image.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [onUploaded, setIsUploading, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="space-y-2">
      <Label>Product Image</Label>
      <div
        className="border-2 border-dashed rounded-md p-3 text-center cursor-pointer transition-colors hover-elevate"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
        data-testid="image-upload-area"
      >
        {imageUrl ? (
          <div className="flex flex-col items-center gap-2">
            <img
              src={imageUrl}
              alt="Product preview"
              className="h-24 w-24 object-cover rounded-md mx-auto"
            />
            <span className="text-xs text-muted-foreground">Click to replace</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2 text-muted-foreground">
            {isUploading ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <Upload className="h-8 w-8" />
            )}
            <span className="text-sm">{isUploading ? "Uploading…" : "Click or drag image here"}</span>
            <span className="text-xs">JPG, PNG, WEBP up to 5MB</span>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      {imageUrl && (
        <div className="flex items-center gap-2">
          <Input
            value={imageUrl}
            onChange={(e) => onUploaded(e.target.value)}
            placeholder="Or paste image URL"
            className="text-xs"
            data-testid="input-image-url"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onUploaded("")}
            title="Clear image"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Variants editor ───────────────────────────────────────────────────────────
function VariantsEditor({
  variants, onChange,
}: {
  variants: ProductVariant[];
  onChange: (v: ProductVariant[]) => void;
}) {
  const addVariant = () => onChange([...variants, { name: "", price: "", description: "" }]);
  const removeVariant = (i: number) => onChange(variants.filter((_, idx) => idx !== i));
  const updateVariant = (i: number, field: keyof ProductVariant, val: string) => {
    const next = [...variants];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <Label>Variants (optional)</Label>
      {variants.map((v, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            value={v.name}
            onChange={(e) => updateVariant(i, "name", e.target.value)}
            placeholder="Variant name"
            className="flex-1"
            data-testid={`input-variant-name-${i}`}
          />
          <Input
            value={v.price}
            onChange={(e) => updateVariant(i, "price", e.target.value)}
            placeholder="Price"
            type="number"
            step="0.01"
            min="0"
            className="w-24"
            data-testid={`input-variant-price-${i}`}
          />
          <Button type="button" size="icon" variant="ghost" onClick={() => removeVariant(i)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addVariant} data-testid="button-add-variant">
        <Plus className="h-3 w-3 mr-1" />
        Add Variant
      </Button>
    </div>
  );
}

// ─── Product Modal ─────────────────────────────────────────────────────────────
function ProductModal({
  open,
  editProduct,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  editProduct: Product | null;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<ProductFormState>(emptyForm());
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(editProduct ? productToForm(editProduct) : emptyForm());
      setErrors({});
    }
  }, [open, editProduct]);

  const set = (field: keyof ProductFormState, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const toggleTag = (tag: string) =>
    set("tags", form.tags.includes(tag) ? form.tags.filter((t) => t !== tag) : [...form.tags, tag]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.category.trim()) e.category = "Category is required";
    const hasPrice = form.price && !isNaN(parseFloat(form.price)) && parseFloat(form.price) > 0;
    const hasVariants = form.variants.some((v) => v.name.trim() && parseFloat(v.price) > 0);
    if (!hasPrice && !hasVariants) e.price = "Enter a price or at least one valid variant";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const createMutation = useMutation({
    mutationFn: (payload: object) => apiRequest("POST", "/api/admin/products", payload),
    onSuccess: () => { toast({ title: "Product created" }); onSaved(); },
    onError: () => toast({ title: "Error", description: "Failed to create product", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: object }) =>
      apiRequest("PUT", `/api/admin/products/${id}`, payload),
    onSuccess: () => { toast({ title: "Product updated" }); onSaved(); },
    onError: () => toast({ title: "Error", description: "Failed to update product", variant: "destructive" }),
  });

  const isPending = createMutation.isPending || updateMutation.isPending || isUploading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const payload = formToPayload(form);
    if (editProduct) {
      updateMutation.mutate({ id: editProduct.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="product-modal">
        <DialogHeader>
          <DialogTitle>{editProduct ? "Edit Product" : "New Product"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1">
            <Label htmlFor="p-name">Name *</Label>
            <Input
              id="p-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Product name"
              data-testid="input-product-name"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Category + Category Group */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="p-category">Category *</Label>
              <div className="flex gap-2">
                <Input
                  id="p-category"
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  placeholder="e.g. starters"
                  list="category-list"
                  data-testid="input-product-category"
                />
                <datalist id="category-list">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-cat-group">Category Group</Label>
              <Input
                id="p-cat-group"
                value={form.categoryGroup}
                onChange={(e) => set("categoryGroup", e.target.value)}
                placeholder="e.g. Food"
                data-testid="input-product-category-group"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea
              id="p-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional product description"
              rows={2}
              data-testid="input-product-description"
            />
          </div>

          {/* Price */}
          <div className="space-y-1">
            <Label htmlFor="p-price">Base Price (€)</Label>
            <Input
              id="p-price"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="w-36"
              data-testid="input-product-price"
            />
            {errors.price && <p className="text-xs text-destructive">{errors.price}</p>}
          </div>

          {/* Variants */}
          <VariantsEditor variants={form.variants} onChange={(v) => set("variants", v)} />

          {/* Default Variant */}
          {form.variants.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="p-default-variant">Default Variant</Label>
              <Select value={form.defaultVariant} onValueChange={(v) => set("defaultVariant", v)}>
                <SelectTrigger id="p-default-variant" className="w-48" data-testid="select-default-variant">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {form.variants.filter((v) => v.name.trim()).map((v) => (
                    <SelectItem key={v.name} value={v.name}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Allergens */}
          <div className="space-y-1">
            <Label htmlFor="p-allergens">Allergens</Label>
            <Input
              id="p-allergens"
              value={form.allergens}
              onChange={(e) => set("allergens", e.target.value)}
              placeholder="gluten, dairy, nuts (comma-separated)"
              data-testid="input-product-allergens"
            />
            <p className="text-xs text-muted-foreground">Separate multiple allergens with commas</p>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2">
              {PREDEFINED_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    form.tags.includes(tag)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover-elevate"
                  }`}
                  data-testid={`tag-toggle-${tag}`}
                >
                  {form.tags.includes(tag) && <Check className="h-3 w-3" />}
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Image */}
          <ImageUploadArea
            imageUrl={form.imageUrl}
            onUploaded={(url) => set("imageUrl", url)}
            isUploading={isUploading}
            setIsUploading={setIsUploading}
          />

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="p-active"
              checked={form.isActive}
              onCheckedChange={(v) => set("isActive", v)}
              data-testid="switch-product-active"
            />
            <Label htmlFor="p-active">Active (visible to customers)</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-save-product">
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editProduct ? "Save Changes" : "Create Product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminProductsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Auth check
  const { data: session, isLoading: sessionLoading } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/admin/session"],
  });
  useEffect(() => {
    if (!sessionLoading && session && !session.authenticated) navigate("/login");
  }, [session, sessionLoading, navigate]);

  // UI state
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  // Build query params
  const queryParams = new URLSearchParams();
  if (debouncedSearch) queryParams.set("search", debouncedSearch);
  if (categoryFilter) queryParams.set("category", categoryFilter);
  if (activeFilter === "active") queryParams.set("isActive", "true");
  if (activeFilter === "inactive") queryParams.set("isActive", "false");

  const { data, isLoading, refetch } = useQuery<{ products: Product[]; meta: { total: number } }>({
    queryKey: ["/api/admin/products", debouncedSearch, categoryFilter, activeFilter],
    queryFn: () =>
      fetch(`/api/admin/products?${queryParams}`, { credentials: "include" }).then((r) => r.json()),
  });

  const productList = data?.products ?? [];

  const categories = Array.from(
    new Set(productList.map((p) => p.category).filter(Boolean))
  ).sort();

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/products/${id}`),
    onSuccess: () => {
      toast({ title: "Product deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      const msg = err.message?.includes("409") ? "Cannot delete — product has order records" : "Failed to delete product";
      toast({ title: "Delete failed", description: msg, variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  const extractMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/extract-products", { dryRun: false, skipImages: false }),
    onSuccess: async (res) => {
      const data = await res.json();
      const summary = data?.summary;
      if (!summary) {
        toast({ title: "Extraction failed", description: "No summary in response", variant: "destructive" });
        return;
      }
      const total = (summary.inserted ?? 0) + (summary.updated ?? 0);
      const errors = summary.errors && summary.errors.length > 0;
      if (total === 0 && !errors) {
        toast({ title: "Extraction complete", description: "No new products found (0 added/updated)" });
      } else if (total > 0 && !errors) {
        toast({ title: "Extraction complete", description: `${total} products added/updated` });
      } else {
        toast({
          title: "Extraction complete (with errors)",
          description: `${total} added/updated, ${summary.errors?.length ?? 0} errors. Check logs.`,
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (err) => {
      toast({
        title: "Extraction failed",
        description: err instanceof Error ? err.message : "Check server logs",
        variant: "destructive",
      });
    },
  });

  const handleSaved = () => {
    setModalOpen(false);
    setEditProduct(null);
    queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
  };

  const openCreate = () => { setEditProduct(null); setModalOpen(true); };
  const openEdit = (p: Product) => { setEditProduct(p); setModalOpen(true); };

  const formatPrice = (p: Product) => {
    if (p.price != null) return `€${Number(p.price).toFixed(2)}`;
    if (p.variants?.length) {
      const prices = p.variants.map((v) => v.price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return min === max ? `€${min.toFixed(2)}` : `€${min.toFixed(2)}–€${max.toFixed(2)}`;
    }
    return "—";
  };

  if (sessionLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Product Management</h1>
            <p className="text-sm text-muted-foreground">
              {data?.meta.total ?? 0} product{data?.meta.total !== 1 ? "s" : ""} total
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => {
              if (!confirm("Re-extract product catalog from menu PDFs? This may take a minute.")) return;
              extractMutation.mutate();
            }}
            disabled={extractMutation.isPending}
            data-testid="button-run-extraction"
          >
            {extractMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <PackageSearch className="h-4 w-4 mr-2" />
            )}
            {extractMutation.isPending ? "Extracting…" : "Run Extraction"}
          </Button>
          <Button onClick={openCreate} data-testid="button-add-product">
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Filters toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="pl-9"
            data-testid="input-search-products"
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setSearch("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select value={categoryFilter || "all"} onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40" data-testid="select-category-filter">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}>
          <SelectTrigger className="w-36" data-testid="select-active-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Products table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Image</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead className="hidden md:table-cell">Price</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-10 w-10 rounded-md" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-14" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : productList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No products found</p>
                  {(search || categoryFilter) && (
                    <Button variant="link" size="sm" onClick={() => { setSearch(""); setCategoryFilter(""); }}>
                      Clear filters
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              productList.map((product) => (
                <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                  <TableCell>
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-10 w-10 object-cover rounded-md"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                        <ImageOff className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{product.name}</div>
                    {product.description && (
                      <div className="text-xs text-muted-foreground truncate max-w-xs">{product.description}</div>
                    )}
                    {product.tags && product.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {product.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 h-4 no-default-active-elevate">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="text-sm capitalize">{product.category}</span>
                    {product.variants && product.variants.length > 0 && (
                      <div className="text-xs text-muted-foreground">{product.variants.length} variants</div>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm tabular-nums">
                    {formatPrice(product)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.isActive ? "default" : "secondary"} className="no-default-active-elevate text-xs">
                      {product.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(product)}
                        title="Edit product"
                        data-testid={`button-edit-product-${product.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(product)}
                        title="Delete product"
                        data-testid={`button-delete-product-${product.id}`}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit modal */}
      <ProductModal
        open={modalOpen}
        editProduct={editProduct}
        categories={categories}
        onClose={() => { setModalOpen(false); setEditProduct(null); }}
        onSaved={handleSaved}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> will be permanently deleted and removed from the customer catalog. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
