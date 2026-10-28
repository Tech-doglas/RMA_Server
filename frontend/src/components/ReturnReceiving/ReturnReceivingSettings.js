import React from 'react';
import ReceivingLayout from './ReceivingLayout';
import TypeSettings from './ReturnReceivingAdmin';
import CompanySettings from './CompanySettings';

export default function ReturnReceivingSettings() {
  return <ReceivingLayout title="Types & companies" subtitle="Manage the options used when receiving and classifying 3PL returns.">
    <div className="receiving-settings-grid"><TypeSettings /><div><CompanySettings /></div></div>
  </ReceivingLayout>;
}
