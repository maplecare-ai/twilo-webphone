import React from 'react';
import { IconPhone } from './icons.jsx';

export default function IncomingCall({ call, onAccept, onReject }) {
  const from = (call?.parameters && call.parameters.From) || 'Unknown';
  // Set by /voice/incoming. Every line rings this one browser client, so without it a
  // call gives no clue which of your numbers was dialled.
  const params = call?.customParameters;
  const label = params?.get?.('LineLabel');
  const number = params?.get?.('Line');
  return (
    <div className="ring-overlay">
      <div className="ring-label">Incoming call</div>
      <div className="avatar"><span className="pulse" /><span className="pulse d2" /><IconPhone /></div>
      <div className="ring-from">{from}</div>
      {(label || number) && (
        <div className="ring-line">to {label || number}{label && number ? ` · ${number}` : ''}</div>
      )}
      <div className="ring-actions">
        <button className="ring-btn decline" onClick={onReject}>Decline</button>
        <button className="ring-btn accept" onClick={onAccept}>Answer</button>
      </div>
    </div>
  );
}
