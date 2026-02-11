import { FC } from "react";
import Link from "next/link";

type NavBarProps = {
  id?: string;
};

export const NavBar: FC<NavBarProps> = ({ id }) => {
  return (
    <nav>
      <div className="flex justify-between">
        <div>Logo</div>
        <div className="flex gap-4">
          <Link href="/experience">Experience</Link>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </div>
    </nav>
  );
};
