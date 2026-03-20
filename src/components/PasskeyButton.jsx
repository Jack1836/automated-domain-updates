import React from 'react';
import './PasskeyButton.css';

const PasskeyButton = ({ onClick }) => {
    return (
        <button type="button" className="passkey-btn" onClick={onClick}>
            <span className="icon">🔑</span>
            Sign in with Passkey
        </button>
    );
};

export default PasskeyButton;
