import Link from 'next/link';

export default function Logo() {
  return (
    <Link href="/" className="hover:opacity-80 transition-opacity">
      <h1 className="text-xl font-black italic tracking-tighter text-white uppercase">
        Trace<span className="text-gray-500">.</span>
      </h1>
    </Link>
  );
}