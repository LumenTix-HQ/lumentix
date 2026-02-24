"use client";

import React, { useState, useCallback } from "react";
import {
  Horizon,
  TransactionBuilder,
  Networks,
  Keypair,
  Asset,
  BASE_FEE,
} from "@stellar/stellar-sdk";

interface StellarPaymentProps {
  eventId: string;
  eventName: string;
  amount: string;
  destinationAddress: string;
  onPaymentSuccess?: (transactionId: string) => void;
  onPaymentError?: (error: Error) => void;
}

interface TransactionStatus {
  status: "idle" | "building" | "signing" | "submitting" | "success" | "error";
  message?: string;
  transactionId?: string;
}

export default function StellarPayment({
  eventId,
  eventName,
  amount,
  destinationAddress,
  onPaymentSuccess,
  onPaymentError,
}: StellarPaymentProps) {
  const [secretKey, setSecretKey] = useState("");
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>(
    {
      status: "idle",
    },
  );
  const [showConfirmation, setShowConfirmation] = useState(false);

  const server = new Horizon.Server("https://horizon-testnet.stellar.org");

  const buildTransaction = useCallback(async () => {
    try {
      setTransactionStatus({
        status: "building",
        message: "Building transaction...",
      });

      const keypair = Keypair.fromSecret(secretKey);
      const sourceAccount = await server.loadAccount(keypair.publicKey());

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation({
          type: "payment",
          destination: destinationAddress,
          asset: Asset.native(),
          amount: amount,
        })
        .addMemo(Horizon.Memo.text(`Event Registration: ${eventId}`))
        .setTimeout(30)
        .build();

      setTransactionStatus({
        status: "signing",
        message: "Please confirm transaction signing...",
      });
      transaction.sign(keypair);

      return transaction;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to build transaction";
      setTransactionStatus({ status: "error", message: errorMessage });
      onPaymentError?.(
        error instanceof Error ? error : new Error(errorMessage),
      );
      throw error;
    }
  }, [secretKey, destinationAddress, amount, eventId, onPaymentError]);

  const submitTransaction = useCallback(
    async (transaction: any) => {
      try {
        setTransactionStatus({
          status: "submitting",
          message: "Submitting transaction to network...",
        });

        const result = await server.submitTransaction(transaction);

        if (result.successful) {
          setTransactionStatus({
            status: "success",
            message: "Payment successful!",
            transactionId: result.hash,
          });
          onPaymentSuccess?.(result.hash);
          setShowConfirmation(true);
        } else {
          throw new Error("Transaction failed");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to submit transaction";
        setTransactionStatus({ status: "error", message: errorMessage });
        onPaymentError?.(
          error instanceof Error ? error : new Error(errorMessage),
        );
      }
    },
    [server, onPaymentSuccess],
  );

  const handlePayment = useCallback(async () => {
    if (!secretKey.trim()) {
      setTransactionStatus({
        status: "error",
        message: "Please enter your secret key",
      });
      return;
    }

    try {
      const transaction = await buildTransaction();
      await submitTransaction(transaction);
    } catch (error) {
      // Error handling is done in the individual functions
    }
  }, [secretKey, buildTransaction, submitTransaction]);

  const resetForm = () => {
    setTransactionStatus({ status: "idle" });
    setSecretKey("");
    setShowConfirmation(false);
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-xl shadow-lg">
      <h3 className="text-xl font-bold mb-4">Register for {eventName}</h3>

      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-2">Event Details:</p>
        <div className="bg-gray-50 p-3 rounded">
          <p className="text-sm">
            <strong>Event:</strong> {eventName}
          </p>
          <p className="text-sm">
            <strong>Amount:</strong> {amount} XLM
          </p>
          <p className="text-sm">
            <strong>Destination:</strong> {destinationAddress.slice(0, 8)}...
            {destinationAddress.slice(-4)}
          </p>
        </div>
      </div>

      {!showConfirmation ? (
        <>
          <div className="mb-4">
            <label
              htmlFor="secretKey"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Your Secret Key (Testnet)
            </label>
            <input
              id="secretKey"
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="S..."
              disabled={transactionStatus.status !== "idle"}
            />
            <p className="text-xs text-gray-500 mt-1">
              Your secret key is used locally to sign the transaction and never
              sent to any server.
            </p>
          </div>

          {transactionStatus.message && (
            <div
              className={`mb-4 p-3 rounded-md text-sm ${
                transactionStatus.status === "error"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : transactionStatus.status === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
              }`}
            >
              {transactionStatus.message}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handlePayment}
              disabled={
                transactionStatus.status !== "idle" || !secretKey.trim()
              }
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {transactionStatus.status === "idle"
                ? "Pay with Stellar"
                : transactionStatus.status === "building"
                  ? "Building..."
                  : transactionStatus.status === "signing"
                    ? "Signing..."
                    : transactionStatus.status === "submitting"
                      ? "Submitting..."
                      : "Processing..."}
            </button>

            {transactionStatus.status === "error" && (
              <button
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="text-center">
          <div className="mb-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-green-700 mb-2">
              Payment Successful!
            </h4>
            <p className="text-sm text-gray-600 mb-3">
              You are now registered for {eventName}
            </p>
            {transactionStatus.transactionId && (
              <div className="bg-gray-50 p-3 rounded mb-4">
                <p className="text-xs text-gray-500 mb-1">Transaction ID:</p>
                <p className="text-xs font-mono break-all">
                  {transactionStatus.transactionId}
                </p>
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${transactionStatus.transactionId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                >
                  View on Stellar Explorer
                </a>
              </div>
            )}
          </div>
          <button
            onClick={resetForm}
            className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors"
          >
            Make Another Payment
          </button>
        </div>
      )}
    </div>
  );
}
