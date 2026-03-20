import React, { useState } from 'react';
import Input from './Input';
import PasskeyButton from './PasskeyButton';
import './LoginPage.css';

const LoginPage = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState(''); // Assuming 'passkey' might also imply password fallback, or just passkey. User asked for username, email, passkey. If passkey is the ONLY auth method besides username/email identification, I should clarity. But usually passkey is an alternative to password. I will include a password field as a fallback standard or just rely on the request. Request said "username,email, passkey". It didn't explicitly say "password". However, a login page without password usually implies magic link or passkey only. I'll stick to the request: Username, Email, Passkey. 
    // Wait, "username, email, passkey" might mean fields for username and email, AND a way to login with passkey. 
    // Or it could mean a registration flow? "create a log in page". 
    // I will assume it's a login page where you can identify with username/email and then authenticate with passkey.
    // OR, standard login often has User/Email + Password. AND a "Sign in with Passkey" button.
    // Given the "passkey" content, I will implement: 
    // 1. Inputs for Username and Email (maybe one field "Username or Email" is better, but user asked for both). I'll provide both as separate fields or a toggle? "Username, Email" suggests both are collected or either. I'll simply add fields for Username and Email. And a button for Passkey. 

    const handlePasskeyLogin = () => {
        alert('Initiating Passkey authentication...');
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        console.log('Login with:', { username, email });
        if (onLogin) onLogin(e);
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h1>Welcome Back</h1>
                    <p>Sign in to your account</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <Input
                        id="username"
                        label="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                    />

                    <Input
                        id="email"
                        label="Email Address"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                    />

                    <PasskeyButton onClick={handlePasskeyLogin} />

                    <button type="submit" className="submit-btn" disabled={!username && !email}>
                        Sign In
                    </button>
                </form>

                <div className="login-footer">
                    <a href="#">Forgot username?</a>
                    <span>&middot;</span>
                    <a href="#">Create an account</a>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
