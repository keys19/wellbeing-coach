"use client";

import React from "react";

export default function DashboardSkeleton() {
  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header Skeleton */}
      <div className="mb-8 bg-gradient-to-r from-indigo-600 via-purple-600 to-purple-700 text-white rounded-xl p-6 shadow-lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
          <div>
            <div className="h-8 w-48 bg-white/30 rounded-md mb-2"></div>
            <div className="h-4 w-32 bg-white/20 rounded-md"></div>
          </div>
          <div className="mt-4 md:mt-0">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm">
              <div className="h-4 w-24 bg-white/20 rounded-full"></div>
            </div>
          </div>
        </div>

        {/* Steps Skeleton */}
        <div className="mt-6 mb-4">
          <div className="flex items-center justify-between gap-2 max-w-3xl mx-auto">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-white/20"></div>
                <div className="h-3 w-20 bg-white/20 rounded-md mt-2"></div>
                {step !== 3 && (
                  <div className="flex-1 h-1 w-20 bg-white/20 mt-2"></div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 bg-white/10 backdrop-blur-sm rounded-lg p-3 max-w-2xl mx-auto">
          <div className="flex items-start space-x-4">
            <div className="w-8 h-8 bg-white/20 rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 bg-white/20 rounded-md"></div>
              <div className="h-3 w-64 bg-white/10 rounded-md"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Overview Skeleton */}
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <div className="w-1 h-6 bg-indigo-600 rounded-full mr-1"></div>
        <div className="h-6 w-40 bg-muted rounded"></div>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="overflow-hidden border-t-4 border-t-muted rounded-lg p-4 space-y-4"
          >
            <div className="h-4 w-32 bg-muted rounded"></div>
            <div className="h-10 w-20 bg-muted rounded"></div>
            <div className="h-2 w-full bg-muted rounded"></div>
          </div>
        ))}
      </div>

      {/* Tabs Skeleton */}
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex gap-1 border rounded-lg w-fit overflow-hidden mx-auto mb-6">
          {['Overview', 'Goals', 'Conversation Insights'].map((tab) => (
            <div
              key={tab}
              className="px-6 py-2 text-sm bg-muted text-muted-foreground rounded"
            >
              {tab}
            </div>
          ))}
        </div>

        <div className="h-48 bg-muted rounded-lg"></div>
      </div>
    </div>
  );
}
