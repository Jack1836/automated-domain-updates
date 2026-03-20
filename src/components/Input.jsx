import React from 'react';
import './Input.css';

const Input = ({ label, type = 'text', id, value, onChange, placeholder, error }) => {
  return (
    <div className="input-group">
      {label && <label htmlFor={id} className="input-label">{label}</label>}
      <input
        type={type}
        id={id}
        className={`input-field ${error ? 'input-error' : ''}`}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      {error && <span className="error-message">{error}</span>}
    </div>
  );
};

export default Input;
