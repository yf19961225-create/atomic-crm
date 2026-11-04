export function WorkbenchMaintenance() {
  return (
    <section className="space-y-3" role="status">
      <h1 className="text-3xl font-semibold">工作台</h1>
      <p>工作台待办维护中。订单、收款和生产记录仍可通过左侧菜单查看。</p>
      <p>已有生产单的工厂交期暂为只读；业务状态及审计记录已保留。</p>
    </section>
  );
}
