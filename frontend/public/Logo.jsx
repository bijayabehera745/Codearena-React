import React from 'react';

export default function CodeArenaLogo({ size = 40, className = "" }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            width={size}
            height={size}
            className={className}
            fill="none"
        >
            {/* Background Hexagon / Arena shape */}
            <path
                d="M50 5 L90 27.5 L90 72.5 L50 95 L10 72.5 L10 27.5 Z"
                fill="#1e1e2e" /* Dark background to match your UI */
                stroke="#7C6AF5"
                strokeWidth="4"
                strokeLinejoin="round"
            />

            {/* Left Bracket / The 'C' */}
            <path
                d="M42 35 L28 50 L42 65"
                stroke="#7C6AF5"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* Right Bracket / The 'A' Right Leg */}
            <path
                d="M58 35 L72 50 L58 65"
                stroke="#ffffff"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* The 'A' Crossbar / Code Slash */}
            <path
                d="M55 30 L45 70"
                stroke="#7C6AF5"
                strokeWidth="8"
                strokeLinecap="round"
            />

            {/* Glowing dot for 'Execution' or 'Active status' */}
            <circle cx="50" cy="80" r="4" fill="#10B981" />
        </svg>
    );
}