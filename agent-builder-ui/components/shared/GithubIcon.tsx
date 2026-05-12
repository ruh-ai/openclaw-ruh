/**
 * GitHub mark icon — inlined because lucide-react 1.0 removed brand icons
 * (trademark policy). Renders the official GitHub Octocat silhouette as an
 * inline SVG so we don't add a third-party icon package just for one mark.
 *
 * Props match the subset of lucide-react icon props the codebase actually
 * uses (className, size). currentColor lets callers tint it via CSS.
 */
import { forwardRef, type SVGProps } from "react";

// forwardRef so it's interchangeable with the ForwardRefExoticComponent shape
// lucide-react icons expose (lets it be assigned to fields typed as
// `LucideProps`-compatible icons elsewhere in the codebase).
export const GithubIcon = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement> & { size?: number | string }>(
  function GithubIcon({ className, size = 16, ...rest }, ref) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden="true"
        className={className}
        ref={ref}
        {...rest}
      >
        <path d="M12 0.296c-6.628 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387 0.599 0.111 0.793-0.262 0.793-0.577v-2.234c-3.338 0.726-4.033-1.416-4.033-1.416-0.546-1.387-1.333-1.756-1.333-1.756-1.089-0.745 0.083-0.729 0.083-0.729 1.205 0.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492 0.997 0.107-0.775 0.418-1.305 0.762-1.604-2.665-0.305-5.467-1.334-5.467-5.931 0-1.31 0.469-2.381 1.236-3.221-0.124-0.303-0.535-1.524 0.117-3.176 0 0 1.008-0.322 3.301 1.23 0.957-0.266 1.983-0.399 3.003-0.404 1.02 0.005 2.047 0.138 3.006 0.404 2.291-1.552 3.297-1.23 3.297-1.23 0.653 1.653 0.242 2.874 0.118 3.176 0.77 0.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921 0.43 0.372 0.823 1.102 0.823 2.222v3.293c0 0.319 0.192 0.694 0.801 0.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    );
  }
);
