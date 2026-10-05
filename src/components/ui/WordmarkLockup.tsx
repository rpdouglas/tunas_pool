/** "TUNAS" slab wordmark over the gold "Weekly Football Pool" ribbon (DESIGN_SYSTEM §5). */
export function WordmarkLockup({
  size = 'hero',
  showPickEm = size === 'hero',
}: {
  size?: 'hero' | 'compact';
  showPickEm?: boolean;
}) {
  const mark = size === 'hero' ? 'text-wordmark' : 'text-h1';
  return (
    <div className="flex flex-col items-center text-center" aria-hidden="true">
      <span className={`wordmark block ${mark}`}>Tunas</span>
      <span className={`ribbon ${size === 'hero' ? 'my-3 text-xl' : 'mt-2 text-body'}`}>
        Weekly Football Pool
      </span>
      {showPickEm && <span className={`wordmark block ${mark}`}>Pick&#8209;Em</span>}
    </div>
  );
}
