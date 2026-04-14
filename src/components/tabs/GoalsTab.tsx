export default function GoalsTab() {
  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-lg font-semibold mb-1 text-indigo-700 flex items-center gap-2">
        <span className="text-base">🌀</span> Active Goals
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Track your progress on current mental health goals
      </p>

      {[
        {
          id: 1,
          title: 'Implement stress-reduction techniques into your daily routine.',
          target: '4 weeks',
          progress: '10%',
          steps: [
            'Explore techniques',
            'Dedicate 10 minutes daily',
            'Reflect and adjust',
          ],
          updated: '2025-04-08T22:53:13.734Z',
        },
        {
          id: 2,
          title:
            'Create a balanced schedule for academic and personal activities.',
          target: '6 weeks',
          progress: '0%',
          steps: ['Use a planner', 'Allocate time', 'Evaluate weekly'],
          updated: '2025-04-08T22:45:28.787Z',
        },
      ].map((goal, idx) => (
        <div
          key={goal.id}
          className="mb-6 border border-gray-200 rounded-md p-4 bg-gray-50"
        >
          <div className="flex justify-between items-center mb-2">
            <div className="text-sm text-indigo-600 font-medium">
              {goal.id}. {goal.title}
            </div>
            <div className="text-xs text-gray-500 font-semibold">
              {goal.progress} Complete
            </div>
          </div>
          <div className="text-xs text-gray-500 mb-2">Target: {goal.target}</div>
          <div className="h-1.5 bg-gray-300 rounded-full mb-4">
            <div
              className="h-full bg-indigo-500 rounded-full"
              style={{ width: goal.progress }}
            ></div>
          </div>
          <div className="text-sm font-medium mb-1">Steps:</div>
          <ul className="space-y-1 mb-2">
            {goal.steps.map((step, i) => (
              <li key={i} className="flex items-center text-sm text-gray-700">
                <span className="mr-2">○</span>
                {step}
              </li>
            ))}
          </ul>
          <div className="text-xs text-gray-400">
            ⏱ Last updated: {goal.updated}
          </div>
        </div>
      ))}

      <button className="w-full mt-4 py-2 bg-indigo-600 text-white font-medium text-sm rounded-md hover:bg-indigo-700 transition">
        Continue Working on Goals →
      </button>

      <div className="mt-4 text-center">
        <button className="bg-violet-600 hover:bg-violet-700 transition text-white font-medium text-sm px-4 py-2 rounded-md">
          Continue Your Coaching Session →
        </button>
      </div>
    </div>
  );
}
