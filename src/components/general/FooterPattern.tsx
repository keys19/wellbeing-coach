import Link from "next/link";
import { HTMLAttributes } from "react";

interface FooterProps extends HTMLAttributes<HTMLElement> {
  name: string;
  links?: Array<{ href: string; label: string }>;
}

export function Footer({ name, links = [], className, ...props }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`border-t border-black/5 py-5 ${className}`} {...props}>
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <p className="text-sm text-gray-700">
              © {currentYear} {name}. All rights reserved.
            </p>
          </div>
          {links.length > 0 && (
            <nav className="flex flex-wrap justify-center md:justify-end gap-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-gray-700 hover:text-gray-900 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>
    </footer>
  );
}
