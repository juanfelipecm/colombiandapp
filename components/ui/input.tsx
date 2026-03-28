interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className = "", id, ...props }: InputProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="mb-3">
      <label htmlFor={inputId} className="block text-base font-semibold text-text-primary mb-1.5">
        {label}
      </label>
      <input
        id={inputId}
        className={`w-full rounded-xl border-[1.5px] px-4 py-3.5 text-base bg-input-bg placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition-colors ${
          error ? "border-brand-red" : "border-border"
        } ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-[13px] text-brand-red">{error}</p>
      )}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ label, error, options, placeholder, className = "", id, ...props }: SelectProps) {
  const selectId = id || label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="mb-3">
      <label htmlFor={selectId} className="block text-base font-semibold text-text-primary mb-1.5">
        {label}
      </label>
      <select
        id={selectId}
        className={`w-full rounded-xl border-[1.5px] px-4 py-3.5 text-base bg-input-bg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition-colors ${
          error ? "border-brand-red" : "border-border"
        } ${className}`}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-[13px] text-brand-red">{error}</p>
      )}
    </div>
  );
}
