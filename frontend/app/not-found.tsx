import Link from "next/link";

export default function NotFound() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-black text-white">
            <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm text-center">
                <h1 className="text-9xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 mb-4 animate-pulse">
                    404
                </h1>
                <h2 className="text-3xl font-bold mb-8">Lost in Stellar Space?</h2>
                <p className="text-gray-400 mb-12 max-w-md mx-auto">
                    The coordinate you're looking for doesn't exist in this galaxy. Let's get you back home.
                </p>
                <Link
                    href="/"
                    className="px-8 py-4 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition-colors shadow-xl"
                >
                    Return to Base
                </Link>
            </div>
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
                <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-red-500 rounded-full blur-[128px]"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-600 rounded-full blur-[160px]"></div>
            </div>
        </main>
    );
}
