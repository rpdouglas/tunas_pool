import type { MDXComponents } from 'mdx/types';
import { GuideLink, Shot, Steps, Tip } from './GuideBlocks';

/** Markdown to the design system: 16px minimum text, the heading fonts, roomy lists. */
export const mdxComponents: MDXComponents = {
  h2: (props) => <h2 className="mb-2 mt-6 font-heading text-h3 first:mt-0" {...props} />,
  h3: (props) => <h3 className="mb-2 mt-4 font-heading text-bar" {...props} />,
  p: (props) => <p className="my-3 text-body" {...props} />,
  ul: (props) => <ul className="my-3 flex list-disc flex-col gap-2 pl-6 text-body" {...props} />,
  ol: (props) => <ol className="my-3 flex list-decimal flex-col gap-2 pl-6 text-body" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  a: GuideLink,
  table: (props) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-body" {...props} />
    </div>
  ),
  th: (props) => (
    <th className="border-b-2 border-line-strong px-2 py-2 text-left font-semibold" {...props} />
  ),
  td: (props) => <td className="border-b border-line-divider px-2 py-2 align-top" {...props} />,
  Shot,
  Tip,
  Steps,
};
