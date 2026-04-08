interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps): JSX.Element {
  return (
    <label className="search-bar">
      <span>Search the registry</span>
      <input
        type="search"
        placeholder="Search by name, package, author, or tag"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
