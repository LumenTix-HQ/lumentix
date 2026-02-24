"use client";

import StellarPayment from "@/components/StellarPayment";
import { stellarService } from "@/lib/stellar";
import { useState } from "react";

export default function TestPaymentPage() {
  const [keypair, setKeypair] = useState<{
    publicKey: string;
    secretKey: string;
  } | null>(null);
  const [fundingStatus, setFundingStatus] = useState<string>("");

  const generateNewAccount = () => {
    const newKeypair = stellarService.generateKeypair();
    setKeypair(newKeypair);
    setFundingStatus("");
  };

  const fundAccount = async () => {
    if (!keypair) return;

    setFundingStatus("Funding account...");
    const result = await stellarService.fundTestnetAccount(keypair.publicKey);

    if (result.success) {
      setFundingStatus(
        "Account funded successfully! You can now make test payments.",
      );
    } else {
      setFundingStatus(`Failed to fund account: ${result.error}`);
    }
  };

  const testEvent = {
    id: "test-event-2024",
    name: "Test Event",
    price: "1",
    destinationAddress:
      "GD5QJLOJ3Z2K5VX7Y3ZK3Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z",
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-br from-black via-gray-900 to-indigo-950 text-white">
      <div className="z-10 max-w-4xl w-full">
        <h1 className="text-4xl font-bold text-center mb-8">
          🧪 Stellar Payment Test
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Account Setup Section */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <h2 className="text-2xl font-semibold mb-4">Test Account Setup</h2>

            {!keypair ? (
              <button
                onClick={generateNewAccount}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors mb-4"
              >
                Generate Test Account
              </button>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Public Key:
                  </label>
                  <div className="bg-black/30 p-3 rounded-lg">
                    <code className="text-xs break-all">
                      {keypair.publicKey}
                    </code>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Secret Key:
                  </label>
                  <div className="bg-black/30 p-3 rounded-lg">
                    <code className="text-xs break-all">
                      {keypair.secretKey}
                    </code>
                  </div>
                  <p className="text-xs text-yellow-400 mt-2">
                    ⚠️ Keep this secret! Copy it for the payment form below.
                  </p>
                </div>

                <button
                  onClick={fundAccount}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Fund Account with Testnet XLM
                </button>

                {fundingStatus && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      fundingStatus.includes("success")
                        ? "bg-green-500/20 text-green-300 border border-green-500/30"
                        : "bg-red-500/20 text-red-300 border border-red-500/30"
                    }`}
                  >
                    {fundingStatus}
                  </div>
                )}

                <button
                  onClick={generateNewAccount}
                  className="w-full border border-gray-400 text-gray-300 py-2 px-4 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Generate New Account
                </button>
              </div>
            )}
          </div>

          {/* Payment Test Section */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <h2 className="text-2xl font-semibold mb-4">Test Payment</h2>
            <p className="text-gray-300 mb-4">
              Test the payment flow using the secret key from the account above.
            </p>

            <StellarPayment
              eventId={testEvent.id}
              eventName={testEvent.name}
              amount={testEvent.price}
              destinationAddress={testEvent.destinationAddress}
              onPaymentSuccess={(txId) => {
                console.log("Test payment successful:", txId);
              }}
              onPaymentError={(error) => {
                console.error("Test payment failed:", error);
              }}
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
          <h3 className="text-xl font-semibold mb-3">📋 Test Instructions</h3>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>
              Click "Generate Test Account" to create a new Stellar testnet
              account
            </li>
            <li>Click "Fund Account with Testnet XLM" to get test lumens</li>
            <li>Copy the secret key and paste it into the payment form</li>
            <li>Click "Pay with Stellar" to test the payment flow</li>
            <li>
              View the transaction on Stellar Explorer after successful payment
            </li>
          </ol>

          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-300">
              <strong>Note:</strong> This is using Stellar Testnet. No real
              money is involved.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
