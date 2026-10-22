import type { Side } from '../chess/position'

interface Props {
  name: string
  color: Side
  onName(name: string): void
  onColor(color: Side): void
  autoFocus?: boolean
}

/** Name and side inputs for an opening. */
export function OpeningFields({ name, color, onName, onColor, autoFocus }: Props) {
  return (
    <div className="fields">
      <label className="field">
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="e.g. Caro-Kann"
          autoFocus={autoFocus}
          maxLength={80}
        />
      </label>
      <div className="field">
        <span>I play</span>
        <div className="segmented" role="radiogroup" aria-label="Side you play">
          {(['white', 'black'] as const).map((side) => (
            <button
              key={side}
              type="button"
              role="radio"
              aria-checked={color === side}
              className={color === side ? 'selected' : ''}
              onClick={() => onColor(side)}
            >
              <span className={`side-dot ${side}`} /> {side === 'white' ? 'White' : 'Black'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
