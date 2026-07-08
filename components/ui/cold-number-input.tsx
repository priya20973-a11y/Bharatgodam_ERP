'use client';

import React, { InputHTMLAttributes, useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import { toEnglishDigits, toGujaratiDigits } from '@/lib/utils/cold-numbers';

interface ColdNumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string | number;
  onChange: (value: string) => void;
  min?: string | number;
  max?: string | number;
  step?: string | number;
}

export function ColdNumberInput({ value, onChange, className, ...props }: ColdNumberInputProps) {
  const { language } = useColdTranslation();
  
  // Local state to manage the displayed value directly (allowing intermediate states like decimal points or minus signs)
  const [displayValue, setDisplayValue] = useState('');

  // Sync incoming value to display string based on active language
  useEffect(() => {
    if (value === '' || value === null || value === undefined) {
      setDisplayValue('');
      return;
    }
    
    // Only update if the parsed internal value differs from the display value's parsed value,
    // to allow intermediate typing (like a trailing dot)
    const currentEnglish = toEnglishDigits(displayValue);
    if (currentEnglish !== String(value)) {
      setDisplayValue(language === 'gu' ? toGujaratiDigits(value) : String(value));
    }
  }, [value, language]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawValue = e.target.value;
    
    // Always normalize to English digits for internal handling and validation
    let englishValue = toEnglishDigits(rawValue);
    
    // Basic validation: only allow numbers, decimals, and negative sign
    // Remove characters that aren't part of a valid float
    englishValue = englishValue.replace(/[^0-9.-]/g, '');
    
    // Ensure only one decimal point
    const parts = englishValue.split('.');
    if (parts.length > 2) {
      englishValue = parts[0] + '.' + parts.slice(1).join('');
    }

    // Ensure negative sign is only at the start
    if (englishValue.indexOf('-') > 0) {
      englishValue = englishValue.replace(/-/g, '');
    }

    // Update the visual state (applying active language digits)
    const newDisplay = language === 'gu' ? toGujaratiDigits(englishValue) : englishValue;
    setDisplayValue(newDisplay);

    // Call onChange with standard english string format (which acts just like standard type="number")
    onChange(englishValue);
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      className={className}
      {...props}
    />
  );
}
