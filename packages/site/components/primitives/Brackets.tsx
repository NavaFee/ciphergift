/**
 * Decorative four-corner accent brackets. Place inside a `position: relative`
 * container; each bracket is an absolutely-positioned 14×14 element.
 */
export function Brackets() {
  return (
    <>
      <span className="bracket-tl" />
      <span className="bracket-tr" />
      <span className="bracket-bl" />
      <span className="bracket-br" />
    </>
  );
}
