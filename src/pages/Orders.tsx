import React, { useEffect, useState, useCallback } from 'react';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import { DateRangeFilter, type DateRange } from '../components/DateRangeFilter';
import { 
  ShoppingCart, ShoppingBag, Plus, Minus, Trash2, CheckCircle, 
  ShieldAlert, FileText, Printer, History
} from 'lucide-react';

interface ProductObj {
  _id: string;
  name: string;
  unit: string;
  sellingPrice: number;
  costPrice: number;
  stockQty: number;
  category: string;
}

interface CustomerObj {
  _id: string;
  name: string;
  mobile: string;
  creditLimit: number;
  outstandingBalance: number;
}

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  rate: number;
  unit: string;
}

export const Orders: React.FC = () => {
  useAuth();
  
  const [activeTab, setActiveTab] = useState<'pos' | 'history'>('pos');

  // Lists
  const [products, setProducts] = useState<ProductObj[]>([]);
  const [customers, setCustomers] = useState<CustomerObj[]>([]);
  const [ordersHistory, setOrdersHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Date filter for history
  const todayStr = new Date().toISOString().split('T')[0];
  const [orderDateRange, setOrderDateRange] = useState<DateRange>({
    startDate: todayStr,
    endDate: todayStr,
    label: 'Today (आज)',
  });

  // POS State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Credit'>('Cash');
  const [notes, setNotes] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // Statuses
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Printable Invoice state
  const [invoiceData, setInvoiceData] = useState<any | null>(null);

  const loadData = async () => {
    try {
      const [productsRes, customersRes] = await Promise.all([
        API.get('/sales/products'),
        API.get('/sales/customers')
      ]);
      setProducts(productsRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (err) {
      console.error('Failed to load POS details', err);
    } finally {
      setLoading(false);
    }
  };

  const loadOrdersHistory = useCallback(async () => {
    try {
      const res = await API.get(`/sales/orders?startDate=${orderDateRange.startDate}&endDate=${orderDateRange.endDate}`);
      setOrdersHistory(res.data || []);
    } catch (e) {
      console.error('Failed to load sales history', e);
    }
  }, [orderDateRange]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      loadOrdersHistory();
    }
  }, [activeTab, loadOrdersHistory]);



  const addToCart = (product: ProductObj) => {
    setSuccessMsg(null);
    setErrorMsg(null);
    setInvoiceData(null);
    const existing = cart.find(item => item.productId === product._id);
    if (existing) {
      if (existing.quantity >= product.stockQty) {
        setErrorMsg(`Cannot add more. Insufficient stock for ${product.name}`);
        return;
      }
      setCart(cart.map(item => 
        item.productId === product._id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      if (product.stockQty <= 0) {
        setErrorMsg(`${product.name} is out of stock.`);
        return;
      }
      setCart([...cart, {
        productId: product._id,
        name: product.name,
        quantity: 1,
        rate: product.sellingPrice,
        unit: product.unit
      }]);
    }
  };

  const updateCartQty = (productId: string, delta: number) => {
    const item = cart.find(c => c.productId === productId);
    const prod = products.find(p => p._id === productId);
    if (!item || !prod) return;

    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      setCart(cart.filter(c => c.productId !== productId));
    } else {
      if (newQty > prod.stockQty) {
        setErrorMsg(`Insufficient stock for ${prod.name}`);
        return;
      }
      setErrorMsg(null);
      setCart(cart.map(c => 
        c.productId === productId 
          ? { ...c, quantity: newQty }
          : c
      ));
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(c => c.productId !== productId));
  };

  const cartTotal = cart.reduce((acc, curr) => acc + (curr.rate * curr.quantity), 0);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      setErrorMsg('Your cart is empty.');
      return;
    }
    if (paymentMode === 'Credit' && !selectedCustomerId) {
      setErrorMsg('Credit sales require selecting a customer.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      const payload = {
        customerId: selectedCustomerId || undefined,
        items: cart.map(c => ({ productId: c.productId, quantity: c.quantity })),
        paymentMode,
        notes
      };

      const res = await API.post('/sales/invoice', payload);
      setSuccessMsg('Billing invoice booked successfully!');
      
      // Store checkout result for receipt display
      setInvoiceData(res.data);

      // Reset cart
      setCart([]);
      setSelectedCustomerId('');
      setNotes('');
      setCustomerSearch('');

      // Reload products (since stock changed)
      const productsRes = await API.get('/products');
      setProducts(productsRes.data.filter((p: any) => p.category !== 'Milk'));
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Invoice checkout failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.mobile.includes(customerSearch)
  );

  const selectedCustomerDoc = customers.find(c => c._id === selectedCustomerId);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500/20 border-t-primary-500 animate-spin" />
      </div>
    );
  }

  const totalSalesVal = ordersHistory.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const cashSalesVal = ordersHistory.filter(o => o.paymentMode === 'Cash').reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const creditSalesVal = ordersHistory.filter(o => o.paymentMode === 'Credit').reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex justify-between items-center px-1">
        <h2 className="text-lg font-black text-white flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-teal-400" />
          <span>Counter Billing & Sales History</span>
        </h2>
        <span className="text-[10px] bg-teal-950 text-teal-400 px-2.5 py-0.5 rounded-full font-bold border border-teal-800/60">
          POS Terminal
        </span>
      </div>

      {/* Tabs */}
      <div className="flex bg-dark-900 p-1.5 rounded-2xl border border-dark-800">
        <button
          onClick={() => setActiveTab('pos')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'pos'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
              : 'text-dark-400 hover:text-white'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>New Billing (नया बिल)</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'history'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
              : 'text-dark-400 hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Sales & Invoices History (बिक्री रिकॉर्ड्स)</span>
        </button>
      </div>

      {activeTab === 'history' ? (
        <div className="space-y-4">
          {/* Date Range Selector */}
          <DateRangeFilter value={orderDateRange} onChange={setOrderDateRange} />

          {/* KPI Summary for Date Range */}
          <div className="grid grid-cols-3 gap-2.5 text-xs">
            <div className="bg-dark-900 p-3 rounded-2xl border border-dark-800 text-center">
              <p className="text-[9px] font-extrabold text-dark-500 uppercase tracking-wide">Total Sales</p>
              <p className="text-base font-black text-teal-400 mt-1">₹{totalSalesVal.toFixed(2)}</p>
              <p className="text-[9px] text-dark-400 mt-0.5">{ordersHistory.length} Invoices</p>
            </div>
            <div className="bg-dark-900 p-3 rounded-2xl border border-dark-800 text-center">
              <p className="text-[9px] font-extrabold text-dark-500 uppercase tracking-wide">Cash Sales</p>
              <p className="text-base font-black text-emerald-400 mt-1">₹{cashSalesVal.toFixed(2)}</p>
            </div>
            <div className="bg-dark-900 p-3 rounded-2xl border border-dark-800 text-center">
              <p className="text-[9px] font-extrabold text-dark-500 uppercase tracking-wide">Credit Sales</p>
              <p className="text-base font-black text-amber-400 mt-1">₹{creditSalesVal.toFixed(2)}</p>
            </div>
          </div>

          {/* Invoices List */}
          <div className="space-y-2.5">
            {ordersHistory.length === 0 ? (
              <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6 text-center text-dark-500 text-xs">
                No invoices booked during this date range.
              </div>
            ) : (
              ordersHistory.map((order) => (
                <div
                  key={order._id}
                  className="bg-dark-900 border border-dark-800 rounded-2xl p-4 shadow-sm space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">#{order._id.slice(-6).toUpperCase()}</span>
                        <span className="text-xs font-bold text-teal-400">{order.customerName}</span>
                      </div>
                      <p className="text-[10px] text-dark-500 mt-0.5">
                        {new Date(order.orderDate).toLocaleString('en-IN')}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-white">₹{order.totalAmount?.toFixed(2)}</span>
                      <span className={`block text-[9px] font-bold mt-0.5 px-1.5 py-0.5 rounded ${
                        order.paymentMode === 'Cash' ? 'bg-emerald-950 text-emerald-400' :
                        order.paymentMode === 'Credit' ? 'bg-amber-950 text-amber-400' : 'bg-blue-950 text-blue-400'
                      }`}>
                        {order.paymentMode} ({order.paymentStatus})
                      </span>
                    </div>
                  </div>

                  {/* Items summary */}
                  <div className="text-[11px] text-dark-400 border-t border-dark-850 pt-2 flex justify-between items-center">
                    <span>
                      {order.items?.map((i: any) => `${i.product?.name || 'Item'} (${i.quantity})`).join(', ')}
                    </span>
                    <button
                      onClick={() => setInvoiceData(order)}
                      className="px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-750 text-[10px] font-bold text-teal-400 border border-dark-700"
                    >
                      View Slip
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <>
          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-900/50 flex gap-2.5 text-xs text-emerald-400 font-medium mb-4">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-900/50 flex gap-2.5 text-xs text-red-400 font-medium mb-4">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* POS Billing Screen */}
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-4">
            
            {/* Customer suggestion */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider">
                Select Customer (Optional, Required for Credit)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Search customer name..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white placeholder-dark-600 focus:outline-none"
                />
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                >
                  <option value="">-- Counter Guest (Cash) --</option>
                  {filteredCustomers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.mobile})
                    </option>
                  ))}
                </select>
              </div>
              {selectedCustomerDoc && (
                <div className="text-[10px] text-dark-400 font-medium flex justify-between bg-dark-950 p-2 rounded-lg border border-dark-850">
                  <span>Outstanding: ₹{selectedCustomerDoc.outstandingBalance}</span>
                  <span>Credit Limit: ₹{selectedCustomerDoc.creditLimit}</span>
                </div>
              )}
            </div>

            {/* Product selection tiles */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider">
                Available Products Menu
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {products.map((p) => (
                  <button
                    key={p._id}
                    onClick={() => addToCart(p)}
                    className="p-3 bg-dark-950 hover:bg-dark-850 border border-dark-800 rounded-2xl flex flex-col justify-between text-left transition-all active:scale-95"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-white">{p.name}</h4>
                      <p className="text-[10px] text-dark-500">Stock: {p.stockQty} {p.unit}</p>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs font-black text-teal-400">₹{p.sellingPrice}/{p.unit}</span>
                      <Plus className="w-3.5 h-3.5 text-dark-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Cart & Billing Checkout */}
            {cart.length > 0 && (
              <div className="pt-4 border-t border-dark-800 space-y-3">
                <h4 className="text-xs font-bold text-dark-400 uppercase tracking-wider">
                  Current Billing Order
                </h4>
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.productId} className="flex justify-between items-center bg-dark-950 p-2.5 rounded-xl border border-dark-850 text-xs">
                      <div>
                        <p className="font-bold text-white">{item.name}</p>
                        <p className="text-[10px] text-dark-500">₹{item.rate} / {item.unit}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 bg-dark-900 border border-dark-800 rounded-lg p-1">
                          <button
                            onClick={() => updateCartQty(item.productId, -1)}
                            className="p-1 hover:text-red-400 text-dark-400"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold px-1 text-white">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQty(item.productId, 1)}
                            className="p-1 hover:text-teal-400 text-dark-400"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-black text-white w-16 text-right">
                          ₹{(item.quantity * item.rate).toFixed(2)}
                        </span>
                        <button
                          onClick={() => removeFromCart(item.productId)}
                          className="text-dark-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-dark-950 rounded-xl border border-dark-850 flex justify-between items-center text-sm font-black">
                  <span className="text-dark-400">Total Bill Amount:</span>
                  <span className="text-lg text-teal-400">₹{cartTotal.toFixed(2)}</span>
                </div>

                <form onSubmit={handleCheckout} className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-dark-400 uppercase mb-1">Payment Mode</label>
                      <select
                        value={paymentMode}
                        onChange={(e: any) => setPaymentMode(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                      >
                        <option value="Cash">Cash (कैश)</option>
                        <option value="UPI">UPI / Online</option>
                        <option value="Credit">Credit (उधार)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-dark-400 uppercase mb-1">Remarks</label>
                      <input
                        type="text"
                        placeholder="Notes..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 text-sm font-bold text-white shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>{isSubmitting ? 'Booking Invoice...' : 'Process Billing Invoice'}</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </>
      )}

      {/* Printable Invoice Receipt after booking or viewing */}
      {invoiceData && (
        <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-4 divide-y divide-dark-800/60">
          
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black uppercase tracking-wider text-dark-400 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-teal-400" />
              Tax Invoice Slip
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="p-1.5 rounded-lg bg-dark-850 border border-dark-800 text-dark-300 hover:text-white"
                title="Print"
              >
                <Printer className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setInvoiceData(null)}
                className="px-2 py-1 rounded-lg bg-dark-850 border border-dark-800 text-xs text-dark-400 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>

          <div className="pt-4 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-dark-500 font-medium">Invoice ID:</span>
              <span className="font-bold text-white">#{invoiceData._id.slice(-6).toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-500 font-medium">Billed To:</span>
              <span className="font-bold text-white">{invoiceData.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-500 font-medium">Payment Mode:</span>
              <span className="font-bold text-white">{invoiceData.paymentMode}</span>
            </div>
          </div>

          {/* Cart items listing */}
          <div className="pt-4 text-xs space-y-2">
            {invoiceData.items?.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-dark-300">
                <span>{item.product?.name || item.name || 'Item'} ({item.quantity})</span>
                <span className="font-bold text-white">₹{item.amount?.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-dark-850 pt-2 font-black text-sm">
              <span className="text-teal-400">Total Billed:</span>
              <span className="text-white">₹{invoiceData.totalAmount?.toFixed(2)}</span>
            </div>
          </div>

          <div className="pt-3 text-[10px] text-center text-dark-500 font-medium">
            Krishna Dairy, Jaipur • Official Billed Invoice
          </div>

        </div>
      )}

    </div>
  );
};
