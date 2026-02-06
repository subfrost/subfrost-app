// FUEL allocation table: maps wallet addresses (taproot or segwit) to allocated FUEL amounts.
// Both taproot (bc1p...) and native segwit (bc1q...) addresses are checked against this table.
// To add a new allocation, add the address as a key with the FUEL amount as the value.

const FUEL_ALLOCATIONS: Record<string, number> = {
  'bc1p3692m0sd6nq5mv4uq0yz2laet3r0asw8kpkrdunkk8ddk045nxzsl2vdsq': 1901,
  'bc1pyvt8gmk7uznk5y7x96rnsawg6w4jmgx8ggkcj9du5ar7arns2rzsu9hne7': 867,
};

export default FUEL_ALLOCATIONS;
