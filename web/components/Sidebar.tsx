"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

type NavItem = {
  label: string;
  href: string;
  disabled?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/" },
  { label: "Transactions", href: "/transactions" },
  { label: "Accounts", href: "/accounts" },
  { label: "Forecast", href: "/forecast", disabled: true },
  { label: "Simulator", href: "/simulator", disabled: true },
  { label: "Settings", href: "/settings", disabled: true },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className={styles.sidebar} aria-label="Main navigation">
      <ul className={styles.list}>
        {NAV_ITEMS.map((item) =>
          item.disabled ? (
            <li
              key={item.href}
              className={styles.itemDisabled}
              aria-disabled="true"
            >
              {item.label}
            </li>
          ) : (
            <li key={item.href}>
              <Link
                href={item.href}
                className={styles.item}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          )
        )}
      </ul>
    </nav>
  );
}
