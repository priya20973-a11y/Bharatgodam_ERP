'use client';

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface MultiSearchableSelectProps {
  value?: string[];
  onValueChange: (value: string[]) => void;
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  id?: string;
  name?: string;
}

export function MultiSearchableSelect({
  value = [],
  onValueChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className = '',
  id,
  name,
}: MultiSearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOptions = options.filter((opt) => value.includes(opt.value));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (optValue: string) => {
    if (value.includes(optValue)) {
      onValueChange(value.filter((v) => v !== optValue));
    } else {
      onValueChange([...value, optValue]);
    }
  };

  const handleRemove = (e: React.MouseEvent, optValue: string) => {
    e.stopPropagation();
    onValueChange(value.filter((v) => v !== optValue));
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        id={id}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`flex min-h-[40px] w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm ring-offset-white placeholder:text-slate-500 focus-within:ring-2 focus-within:ring-slate-950 focus-within:ring-offset-2 ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        } ${className}`}
      >
        <div className="flex flex-wrap gap-1 flex-1">
          {selectedOptions.length > 0 ? (
            selectedOptions.map((opt) => (
              <span
                key={opt.value}
                className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800"
              >
                {opt.label}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => handleRemove(e, opt.value)}
                    className="text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))
          ) : (
            <span className="text-slate-400 py-0.5">{placeholder}</span>
          )}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 ml-2" />
      </div>

      {isOpen && !disabled && (
        <div className="absolute top-full mt-1 left-0 z-50 w-full min-w-[180px] rounded-md border border-slate-200 bg-white p-1.5 shadow-lg animate-in fade-in-80">
          <div className="relative mb-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type to filter..."
              className="w-full rounded border border-slate-200 bg-slate-50 pl-8 pr-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">No options found</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value.includes(opt.value);
                return (
                  <button
                    type="button"
                    key={opt.value}
                    disabled={opt.disabled}
                    onClick={() => {
                      if (!opt.disabled) {
                        handleSelect(opt.value);
                      }
                    }}
                    className={`w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-700 font-semibold'
                        : opt.disabled
                        ? 'opacity-50 cursor-not-allowed text-slate-400'
                        : 'hover:bg-slate-100 text-slate-700 cursor-pointer'
                    }`}
                  >
                    <span className="truncate mr-2">{opt.label}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
      
      {/* Hidden inputs for native form submission if needed */}
      {name && value.map(val => (
         <input type="hidden" key={val} name={name} value={val} />
      ))}
    </div>
  );
}
