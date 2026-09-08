import React, { useEffect, useState, useCallback } from 'react';
import API from '../api';
import {
  UtensilsCrossed,
  Scan,
  PlusCircle,
  Search,
  Barcode,
  Edit2,
  X,
  Save,
  Package,
} from 'lucide-react';

const CATEGORIES = ['All', 'Milk', 'Paneer', 'Curd', 'Ghee', 'Butter', 'Cream', 'Khoya', 'Other'];
const UNITS = ['Litre', 'KG', 'Packet', 'Piece', 'Bottle', 'Gram'];

interface ProductItem {
  _id: string;
  name: string;
  category: string;
  unit: string;
  sellingPrice: number;
  costPrice: number;
  stockQty: number;
  barcode?: string;
  status: string;
}

export const Menu: React.FC = () => {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Barcode Scanner Modal
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualBarcodeScan, setManualBarcodeScan] = useState('');
  const [scannedAlert, setScannedAlert] = useState<string | null>(null);

  // Add / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductItem | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Milk');
  const [unit, setUnit] = useState('Litre');
  const [sellingPrice, setSellingPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stockQty, setStockQty] = useState('0');
  const [barcode, setBarcode] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sampleBarcodes = [
    { code: '8901234567890', label: 'Fresh Milk 1L' },
    { code: '8901234567891', label: 'Fresh Paneer 1Kg' },
    { code: '8901234567892', label: 'Sweet Curd 1Kg' },
    { code: '8901234567893', label: 'Desi Ghee 1Kg' },
    { code: '8901234567894', label: 'White Butter 1Kg' },
  ];

  const loadProducts = useCallback(async () => {
    try {
      const res = await API.get('/sales/products');
      setProducts(res.data || []);
    } catch (e) {
      console.error('Failed to load menu items:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setName('');
    setCategory('Milk');
    setUnit('Litre');
    setSellingPrice('');
    setCostPrice('');
    setStockQty('0');
    setBarcode('');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (p: ProductItem) => {
    setEditingItem(p);
    setName(p.name);
    setCategory(p.category || 'Milk');
    setUnit(p.unit || 'Litre');
    setSellingPrice(String(p.sellingPrice));
    setCostPrice(String(p.costPrice || 0));
    setStockQty(String(p.stockQty || 0));
    setBarcode(p.barcode || '');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sellingPrice) {
      setErrorMsg('Product Name and Selling Price are required.');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        category,
        unit,
        sellingPrice: parseFloat(sellingPrice),
        costPrice: costPrice ? parseFloat(costPrice) : 0,
        stockQty: stockQty ? parseFloat(stockQty) : 0,
        barcode: barcode.trim() || undefined,
      };

      if (editingItem) {
        await API.put(`/sales/products/${editingItem._id}`, payload);
      } else {
        await API.post('/sales/products', payload);
      }

      setModalOpen(false);
      loadProducts();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to save product.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleScanBarcode = (code: string) => {
    setSearchQuery(code);
    setScannerOpen(false);
    const matched = products.find((p) => p.barcode === code);
    if (matched) {
      setScannedAlert(`Found: ${matched.name} (₹${matched.sellingPrice}/${matched.unit})`);
    } else {
      setScannedAlert(`No product with barcode ${code}. Click "+ Add Item" to register it.`);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.barcode && p.barcode.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 rounded-full border-2 border-teal-500/20 border-t-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="w-6 h-6 text-teal-400" />
          <div>
            <h2 className="text-lg font-black text-white">Dairy Menu & Price List</h2>
            <p className="text-[10px] text-dark-400 font-medium">Rate Catalog, Stock & Barcode SKU</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Scan Button */}
          <button
            onClick={() => setScannerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-950/60 border border-teal-800/60 text-xs font-bold text-teal-400 hover:brightness-110 active:scale-95 transition-all shadow-sm"
          >
            <Scan className="w-4 h-4 text-teal-400" />
            <span>Scan Barcode</span>
          </button>

          {/* Add Item Button */}
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-teal-600 hover:brightness-110 active:scale-95 text-xs font-bold text-white shadow-md shadow-teal-500/20 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 w-4 h-4 text-dark-500" />
        <input
          type="text"
          placeholder="Search product name or barcode..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-dark-900 border border-dark-800 text-xs text-white placeholder-dark-600 focus:outline-none focus:border-teal-500 transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setScannedAlert(null); }}
            className="absolute right-3.5 top-3 text-dark-500 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Scanned Feedback Notification Banner */}
      {scannedAlert && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-teal-950/40 border border-teal-900/50 text-xs text-teal-300 font-medium">
          <div className="flex items-center gap-2">
            <Barcode className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{scannedAlert}</span>
          </div>
          <button onClick={() => setScannedAlert(null)} className="text-teal-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Category Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
                : 'bg-dark-900 border border-dark-800 text-dark-400 hover:text-dark-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product Cards List */}
      <div className="space-y-3">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 bg-dark-900 rounded-3xl border border-dark-800 space-y-3">
            <Package className="w-10 h-10 text-dark-600 mx-auto" />
            <p className="text-xs text-dark-400 font-medium">No menu products found.</p>
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 rounded-xl bg-teal-600/20 text-teal-400 border border-teal-500/30 text-xs font-bold hover:bg-teal-600/30 transition-all"
            >
              + Register New Product
            </button>
          </div>
        ) : (
          filteredProducts.map((item) => (
            <div
              key={item._id}
              className="bg-dark-900 border border-dark-800 rounded-3xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{item.name}</h3>
                    <span className="bg-dark-800 text-teal-400 text-[10px] font-bold px-2 py-0.5 rounded-md">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-[10px] text-dark-500 font-medium mt-0.5">Unit: {item.unit}</p>
                </div>

                <button
                  onClick={() => handleOpenEdit(item)}
                  className="p-2 bg-dark-800 hover:bg-dark-750 rounded-xl text-teal-400 border border-dark-700 transition-colors"
                  title="Edit Product"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Price & Stock Stats Grid */}
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-dark-800/60 text-xs">
                <div className="bg-dark-950 p-2 rounded-xl border border-dark-800/40 text-center">
                  <p className="text-[9px] font-extrabold text-dark-500 uppercase tracking-wide">Selling Price</p>
                  <p className="font-black text-teal-400 mt-0.5">₹{item.sellingPrice}/{item.unit}</p>
                </div>

                <div className="bg-dark-950 p-2 rounded-xl border border-dark-800/40 text-center">
                  <p className="text-[9px] font-extrabold text-dark-500 uppercase tracking-wide">Cost Price</p>
                  <p className="font-bold text-white mt-0.5">₹{item.costPrice || 0}</p>
                </div>

                <div className="bg-dark-950 p-2 rounded-xl border border-dark-800/40 text-center">
                  <p className="text-[9px] font-extrabold text-dark-500 uppercase tracking-wide">Available Stock</p>
                  <p className={`font-bold mt-0.5 ${item.stockQty > 10 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {item.stockQty} {item.unit}
                  </p>
                </div>
              </div>

              {/* Barcode Tag */}
              <div className="mt-2.5 flex items-center justify-between text-[10px]">
                {item.barcode ? (
                  <span className="flex items-center gap-1 text-dark-400 font-mono bg-dark-950 px-2 py-1 rounded-lg border border-dark-800">
                    <Barcode className="w-3.5 h-3.5 text-teal-400" />
                    <span>Barcode: {item.barcode}</span>
                  </span>
                ) : (
                  <button
                    onClick={() => handleOpenEdit(item)}
                    className="text-dark-500 hover:text-teal-400 flex items-center gap-1 font-medium"
                  >
                    <Barcode className="w-3 h-3" />
                    <span>+ Add Barcode</span>
                  </button>
                )}
                <span className={`w-2 h-2 rounded-full ${item.stockQty > 0 ? 'bg-emerald-400' : 'bg-red-400'}`} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Barcode Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-dark-800">
              <div className="flex items-center gap-2">
                <Scan className="w-5 h-5 text-teal-400" />
                <h3 className="text-base font-bold text-white">Barcode & QR Scanner</h3>
              </div>
              <button onClick={() => setScannerOpen(false)} className="text-dark-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Viewfinder simulation box */}
            <div className="relative h-40 bg-dark-950 rounded-2xl border border-dark-800 flex flex-col items-center justify-center overflow-hidden">
              <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-teal-400 shadow-[0_0_12px_#2dd4bf] animate-pulse" />
              <Barcode className="w-16 h-16 text-dark-700 opacity-40 mb-2" />
              <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                Align barcode within camera view
              </p>
            </div>

            {/* Manual input */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                Manual / Barcode Gun Input
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter or scan barcode..."
                  value={manualBarcodeScan}
                  onChange={(e) => setManualBarcodeScan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualBarcodeScan.trim()) {
                      handleScanBarcode(manualBarcodeScan.trim());
                    }
                  }}
                  autoFocus
                  className="flex-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (manualBarcodeScan.trim()) handleScanBarcode(manualBarcodeScan.trim());
                  }}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold"
                >
                  Lookup
                </button>
              </div>
            </div>

            {/* Quick Demo Barcodes */}
            <div className="space-y-1.5 pt-2 border-t border-dark-800">
              <p className="text-[10px] text-dark-500 font-bold uppercase">Quick Demo Tap:</p>
              <div className="flex flex-wrap gap-1.5">
                {sampleBarcodes.map((item) => (
                  <button
                    key={item.code}
                    onClick={() => handleScanBarcode(item.code)}
                    className="px-2.5 py-1 rounded-lg bg-dark-950 border border-dark-800 text-[10px] font-mono text-teal-400 hover:border-teal-500 transition-colors"
                  >
                    {item.label} ({item.code.slice(-4)})
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 my-8">
            <div className="flex justify-between items-center pb-2 border-b border-dark-800">
              <h3 className="text-base font-bold text-white">
                {editingItem ? 'Edit Menu Product' : 'Register New Menu Product'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-dark-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-900/50 text-xs text-red-400 font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-3.5">
              {/* Product Name */}
              <div>
                <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fresh Desi Paneer"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Category & Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                    Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500"
                  >
                    {CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                    Unit *
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selling Price, Cost Price, Stock */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                    Selling Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="400"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    required
                    className="w-full px-2 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                    Cost Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="320"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    className="w-full px-2 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                    Quantity / Stock ({unit})
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="30"
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    className="w-full px-2 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Barcode / SKU */}
              <div>
                <label className="block text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1">
                  Barcode / SKU Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 8901234567891"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-teal-900/60 text-xs text-white focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-dark-800 hover:bg-dark-750 text-xs font-bold text-dark-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:brightness-110 text-xs font-bold text-white disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{submitting ? 'Saving...' : editingItem ? 'Update Item' : 'Add Item'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
