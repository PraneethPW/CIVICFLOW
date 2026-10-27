import { Canvas, useFrame } from "@react-three/fiber";
import {
  Float,
  MeshDistortMaterial,
  OrbitControls,
  Stars,
  Text,
} from "@react-three/drei";
import { useRef } from "react";
import type { Group, Mesh } from "three";

function ServiceNode({
  position,
  color,
  label,
}: {
  position: [number, number, number];
  color: string;
  label: string;
}) {
  return (
    <Float speed={2.2} rotationIntensity={0.25} floatIntensity={0.45}>
      <group position={position}>
        <mesh>
          <sphereGeometry args={[0.16, 32, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.7}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.27, 0.008, 10, 64]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.55}
          />
        </mesh>
        <Text
          position={[0, -0.38, 0]}
          fontSize={0.1}
          anchorX="center"
          color="#e2e8f0"
        >
          {label}
        </Text>
      </group>
    </Float>
  );
}

function DocumentCard({
  position,
  rotation,
  title,
  accent,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  title: string;
  accent: string;
}) {
  return (
    <Float speed={2.8} rotationIntensity={0.18} floatIntensity={0.55}>
      <group position={position} rotation={rotation}>
        <mesh>
          <boxGeometry args={[1.05, 0.68, 0.035]} />
          <meshStandardMaterial
            color="#f8fafc"
            roughness={0.5}
            metalness={0.04}
          />
        </mesh>
        <mesh position={[-0.38, 0.2, 0.024]}>
          <boxGeometry args={[0.14, 0.14, 0.018]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={0.2}
          />
        </mesh>
        {[0.2, 0, -0.2].map((y, index) => (
          <mesh key={y} position={[0.14, y, 0.026]}>
            <boxGeometry args={[0.58 - index * 0.1, 0.035, 0.018]} />
            <meshStandardMaterial color={index === 0 ? "#0f172a" : "#94a3b8"} />
          </mesh>
        ))}
        <Text
          position={[0, -0.42, 0.04]}
          fontSize={0.075}
          anchorX="center"
          color="#cbd5e1"
        >
          {title}
        </Text>
      </group>
    </Float>
  );
}

function CivicBuilding() {
  return (
    <group position={[-1.95, -1.15, -0.12]} rotation={[0.04, 0.45, 0]}>
      <mesh position={[0, 0.7, 0]}>
        <coneGeometry args={[0.72, 0.34, 3]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#0369a1"
          emissiveIntensity={0.3}
        />
      </mesh>
      <mesh position={[0, 0.48, 0]}>
        <boxGeometry args={[1.32, 0.12, 0.18]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      {[-0.46, -0.16, 0.16, 0.46].map((x) => (
        <mesh key={x} position={[x, 0.15, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.58, 18]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.42} />
        </mesh>
      ))}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[1.48, 0.16, 0.22]} />
        <meshStandardMaterial
          color="#22c55e"
          emissive="#166534"
          emissiveIntensity={0.18}
        />
      </mesh>
      <Text
        position={[0, -0.52, 0.04]}
        fontSize={0.1}
        anchorX="center"
        color="#e2e8f0"
      >
        Public Services
      </Text>
    </group>
  );
}

function PhoneDashboard() {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y = Math.sin(Date.now() * 0.0006) * 0.12;
      group.current.position.y += Math.sin(Date.now() * 0.0012) * delta * 0.07;
    }
  });
  return (
    <group ref={group} position={[0.1, 0.05, 0]}>
      <mesh>
        <boxGeometry args={[1.48, 2.45, 0.12]} />
        <meshStandardMaterial
          color="#0f172a"
          metalness={0.35}
          roughness={0.28}
        />
      </mesh>
      <mesh position={[0, 0, 0.071]}>
        <boxGeometry args={[1.32, 2.2, 0.02]} />
        <meshStandardMaterial
          color="#101827"
          emissive="#0f172a"
          emissiveIntensity={0.45}
        />
      </mesh>
      <mesh position={[0, 0.83, 0.09]}>
        <boxGeometry args={[1.0, 0.32, 0.025]} />
        <meshStandardMaterial
          color="#2dd4bf"
          emissive="#0f766e"
          emissiveIntensity={0.5}
        />
      </mesh>
      <Text
        position={[0, 0.83, 0.115]}
        fontSize={0.105}
        anchorX="center"
        anchorY="middle"
        color="#042f2e"
      >
        CivicFlow AI
      </Text>
      {[0.36, 0.04, -0.28].map((y, index) => (
        <group key={y} position={[0, y, 0.095]}>
          <mesh position={[-0.42, 0, 0]}>
            <boxGeometry args={[0.18, 0.18, 0.025]} />
            <meshStandardMaterial
              color={["#facc15", "#38bdf8", "#fb7185"][index]}
              emissive={["#a16207", "#0369a1", "#be123c"][index]}
              emissiveIntensity={0.28}
            />
          </mesh>
          <mesh position={[0.16, 0.04, 0]}>
            <boxGeometry args={[0.72, 0.035, 0.02]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
          <mesh position={[0.03, -0.06, 0]}>
            <boxGeometry args={[0.45, 0.028, 0.02]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.78, 0.102]}>
        <boxGeometry args={[0.86, 0.2, 0.03]} />
        <meshStandardMaterial
          color="#fb7185"
          emissive="#be123c"
          emissiveIntensity={0.35}
        />
      </mesh>
      <Text
        position={[0, -0.78, 0.128]}
        fontSize={0.085}
        anchorX="center"
        anchorY="middle"
        color="#fff1f2"
      >
        Track application
      </Text>
    </group>
  );
}

function CivicFlowScene() {
  const scanner = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (scanner.current) scanner.current.rotation.z += delta * 0.85;
  });
  return (
    <group>
      <PhoneDashboard />
      <CivicBuilding />
      <DocumentCard
        position={[1.75, 0.95, -0.18]}
        rotation={[0.08, -0.42, 0.08]}
        title="Checklist"
        accent="#22c55e"
      />
      <DocumentCard
        position={[1.9, -0.72, 0.05]}
        rotation={[-0.06, -0.58, -0.12]}
        title="OCR Proof"
        accent="#38bdf8"
      />
      <ServiceNode
        position={[-1.55, 1.2, 0.05]}
        color="#facc15"
        label="Eligibility"
      />
      <ServiceNode
        position={[1.35, 1.62, 0.02]}
        color="#2dd4bf"
        label="AI Chat"
      />
      <ServiceNode
        position={[-1.25, -0.35, 0.18]}
        color="#fb7185"
        label="Complaint"
      />
      <mesh
        ref={scanner}
        position={[1.15, -0.1, 0.16]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <torusGeometry args={[0.62, 0.014, 12, 96]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#0284c7"
          emissiveIntensity={0.8}
        />
      </mesh>
      <mesh position={[0.08, 0.05, -0.36]} scale={1.7}>
        <icosahedronGeometry args={[1, 2]} />
        <MeshDistortMaterial
          color="#0f766e"
          emissive="#14b8a6"
          emissiveIntensity={0.16}
          transparent
          opacity={0.22}
          roughness={0.28}
          metalness={0.5}
          distort={0.18}
          speed={1.2}
        />
      </mesh>
    </group>
  );
}

function Scene() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
      <ambientLight intensity={1.2} />
      <pointLight position={[4, 3, 5]} intensity={70} color="#5eead4" />
      <pointLight position={[-4, -2, 4]} intensity={45} color="#fb7185" />
      <Stars radius={42} depth={32} count={900} factor={3} fade speed={1} />
      <CivicFlowScene />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.75}
      />
    </Canvas>
  );
}

export default Scene;
