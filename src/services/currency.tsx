import React, { createContext, useContext, useState } from 'react';

export type CurrencyMode = 'USD' | 'LRD' | 'DUAL';

export interface CurrencyContextType {
  mode: CurrencyMode;
  setMode: (mode: CurrencyMode) => void;
  exchangeRate: number; // 1 USD = X LRD (default: 195)
  setExchangeRate: (rate: number) => void;
  formatMoney: (amountInUSD: number, customMode?: CurrencyMode) => string;
  formatAmount: (amountInUSD: number, customMode?: CurrencyMode) => string;
  formatUSD: (amountInUSD: number) => string;
  formatLRD: (amountInUSD: number) => string;
}

const STORAGE_CURRENCY_KEY = 'activa_currency_mode';
const STORAGE_RATE_KEY = 'activa_lrd_usd_rate';
const DEFAULT_LRD_RATE = 195.0; // 1 USD = 195 LRD

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<CurrencyMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CURRENCY_KEY);
      return (saved as CurrencyMode) || 'USD';
    } catch {
      return 'USD';
    }
  });

  const [exchangeRate, setRateState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_RATE_KEY);
      return saved ? parseFloat(saved) : DEFAULT_LRD_RATE;
    } catch {
      return DEFAULT_LRD_RATE;
    }
  });

  const setMode = (newMode: CurrencyMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_CURRENCY_KEY, newMode);
    } catch (e) {
      console.warn('Could not save currency mode to localStorage', e);
    }
  };

  const setExchangeRate = (newRate: number) => {
    setRateState(newRate);
    try {
      localStorage.setItem(STORAGE_RATE_KEY, newRate.toString());
    } catch (e) {
      console.warn('Could not save exchange rate to localStorage', e);
    }
  };

  const formatUSD = (amount: number = 0): string => {
    const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const formatLRD = (amountInUSD: number = 0): string => {
    const val = typeof amountInUSD === 'number' && !isNaN(amountInUSD) ? amountInUSD : 0;
    const lrdAmount = val * exchangeRate;
    return `L$ ${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(lrdAmount)}`;
  };

  const formatMoney = (amountInUSD: number = 0, customMode?: CurrencyMode): string => {
    const val = typeof amountInUSD === 'number' && !isNaN(amountInUSD) ? amountInUSD : 0;
    const activeMode = customMode || mode;
    if (activeMode === 'USD') {
      return formatUSD(val);
    }
    if (activeMode === 'LRD') {
      return formatLRD(val);
    }
    // DUAL Mode
    return `${formatUSD(val)} (${formatLRD(val)})`;
  };

  const formatAmount = (amountInUSD: number = 0, customMode?: CurrencyMode): string => {
    return formatMoney(amountInUSD, customMode);
  };

  return (
    <CurrencyContext.Provider
      value={{
        mode,
        setMode,
        exchangeRate,
        setExchangeRate,
        formatMoney,
        formatAmount,
        formatUSD,
        formatLRD,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = (): CurrencyContextType => {
  const context = useContext(CurrencyContext);
  if (!context) {
    // Robust fallback if used outside CurrencyProvider
    const rate = DEFAULT_LRD_RATE;
    const formatUSD = (amount: number = 0) => {
      const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(val);
    };
    const formatLRD = (amount: number = 0) => {
      const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
      return `L$ ${(val * rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    const formatMoney = (amount: number = 0, customMode?: CurrencyMode) => {
      const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
      if (customMode === 'LRD') return formatLRD(val);
      if (customMode === 'DUAL') return `${formatUSD(val)} (${formatLRD(val)})`;
      return formatUSD(val);
    };

    return {
      mode: 'USD',
      setMode: () => {},
      exchangeRate: rate,
      setExchangeRate: () => {},
      formatMoney,
      formatAmount: formatMoney,
      formatUSD,
      formatLRD,
    };
  }
  return context;
};
