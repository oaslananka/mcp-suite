interface TagFilterProps {
  tags: string[];
  activeTag: string;
  onSelect: (tag: string) => void;
}

export function TagFilter({ tags, activeTag, onSelect }: TagFilterProps): JSX.Element {
  return (
    <div className="tag-row" aria-label="Tag filters">
      <button type="button" className={activeTag === "" ? "tag active" : "tag"} onClick={() => onSelect("")}>
        All
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          className={activeTag === tag ? "tag active" : "tag"}
          onClick={() => onSelect(tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
