export default function InsightsTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
      {/* Conversation Analysis */}
      <div className="p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-lg font-semibold mb-2 text-indigo-700">🗣️ Conversation Analysis</h2>
        <p className="text-sm text-gray-500 mb-4">
          Insights derived from your coaching sessions
        </p>

        <div className="mb-6">
          <h3 className="text-sm font-semibold mb-2 text-gray-700">📌 Key Themes</h3>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
            <li>Anxiety management when starting new tasks</li>
            <li>Progress tracking and acknowledgment</li>
            <li>Time management and prioritization</li>
            <li>Stress reduction techniques</li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2 text-gray-700">🧠 Communication Style</h3>
          <div className="text-sm text-gray-700 space-y-1">
            <p>
              <span className="font-medium">Tone:</span>{' '}
              <span className="text-blue-600 font-semibold bg-blue-100 px-2 py-0.5 rounded-md text-xs">Formal</span>
            </p>
            <p>
              <span className="font-medium">Response Length:</span>{' '}
              <span className="text-green-600 font-semibold bg-green-100 px-2 py-0.5 rounded-md text-xs">Short</span>
            </p>
            <p>
              <span className="font-medium">Emotional Style:</span>{' '}
              <span className="text-yellow-600 font-semibold bg-yellow-100 px-2 py-0.5 rounded-md text-xs">Neutral</span>
            </p>
            <p>
              <span className="font-medium">Thinking Style:</span>{' '}
              <span className="text-indigo-600 font-semibold bg-indigo-100 px-2 py-0.5 rounded-md text-xs">Experience-Based</span>
            </p>
            <p className="pt-2">
              You communicate in a formal manner with short responses. Your style tends to be neutral with an experience-based approach to problems.
            </p>
          </div>
        </div>
      </div>

      {/* Recent Session Highlights */}
      <div className="p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-lg font-semibold mb-2 text-indigo-700">📝 Recent Session Highlights</h2>
        <p className="text-sm text-gray-500 mb-4">
          Key points from your recent coaching sessions
        </p>

        {[
          {
            date: '2025-04-09T09:57:16.642Z',
            content: 'I understand that you want to see your progress marked as complete.',
          },
          {
            date: '2025-04-09T09:57:16.738Z',
            content:
              "You've done a great job exploring different stress-reduction techniques and dedicating time to practice them daily.",
          },
          {
            date: '2025-04-09T09:57:15.175Z',
            content: 'Do they feel manageable and meaningful?',
          },
        ].map((highlight, index) => (
          <div
            key={index}
            className="mb-4 p-4 bg-gray-50 rounded-md border border-gray-200"
          >
            <p className="text-xs text-gray-400 font-medium mb-1">{highlight.date}</p>
            <p className="text-sm text-gray-700">{highlight.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
